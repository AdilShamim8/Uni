"""Google Drive as a personal memory source.

Design choices
  • Read-only scope (`drive.readonly`). ReWoo can never edit or delete your files.
  • You choose folders. Nothing outside them is ever listed or indexed.
  • Incremental: each file's `modifiedTime` + content hash is remembered, so a
    re-sync only re-reads what changed, and removes what you deleted.
  • Google Docs/Sheets/Slides are exported to text; PDFs, text, Markdown, CSV,
    DOCX and HTML are downloaded and extracted.
  • Tokens are stored only in your local ReWoo database and can be revoked
    from Settings (Disconnect) or from your Google account.

No Google SDK is needed — just the REST API over httpx, which also makes the
whole flow testable with a fake transport.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

import httpx

from ..db import Store, now
from ..memory.store import Memory
from ..memory.text import extract_text

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://www.googleapis.com/drive/v3"
SCOPE = "https://www.googleapis.com/auth/drive.readonly"
SOURCE_ID = "src_gdrive"

EXPORTS = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.spreadsheet": "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
}
DOWNLOADABLE = ("text/", "application/pdf", "application/json",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
MAX_FILE_BYTES = 15 * 1024 * 1024


class DriveError(Exception):
    pass


class GoogleDrive:
    def __init__(self, store: Store, memory: Memory, client_id: str = "", client_secret: str = "",
                 redirect_uri: str = "", transport: Optional[httpx.AsyncBaseTransport] = None):
        self.store, self.memory = store, memory
        self._client_id, self._client_secret = client_id, client_secret
        self.redirect_uri = redirect_uri
        self.transport = transport

    # ------------------------------------------------------------ settings
    @property
    def client_id(self) -> str:
        return self._client_id or self.store.get_setting("google_client_id", "")

    @property
    def client_secret(self) -> str:
        return self._client_secret or self.store.get_setting("google_client_secret", "")

    def configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    def tokens(self) -> Dict[str, Any]:
        return self.store.get_setting("gdrive_tokens", {}) or {}

    def connected(self) -> bool:
        return bool(self.tokens().get("refresh_token") or self.tokens().get("access_token"))

    def folders(self) -> List[Dict[str, str]]:
        return self.store.get_setting("gdrive_folders", []) or []

    def status(self) -> Dict[str, Any]:
        src = self.store.get("sources", SOURCE_ID)
        return {
            "configured": self.configured(), "connected": self.connected(), "folders": self.folders(),
            "account": self.tokens().get("email", ""), "redirect_uri": self.redirect_uri,
            "last_sync": src["last_sync"] if src else None, "status": src["status"] if src else "not connected",
        }

    # --------------------------------------------------------------- OAuth
    def auth_url(self, state: str) -> str:
        if not self.configured():
            raise DriveError("Google client ID/secret not set. See docs/GOOGLE_DRIVE.md.")
        q = {"client_id": self.client_id, "redirect_uri": self.redirect_uri, "response_type": "code", "scope": SCOPE,
             "access_type": "offline", "prompt": "consent", "include_granted_scopes": "true", "state": state}
        return f"{AUTH_URL}?{urlencode(q)}"

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=60, transport=self.transport)

    async def exchange_code(self, code: str) -> Dict[str, Any]:
        async with self._client() as c:
            r = await c.post(TOKEN_URL, data={"code": code, "client_id": self.client_id, "client_secret": self.client_secret,
                                              "redirect_uri": self.redirect_uri, "grant_type": "authorization_code"})
        if r.status_code >= 400:
            raise DriveError(f"Google sign-in failed: {r.text[:200]}")
        tok = r.json()
        tok["expires_at"] = time.time() + int(tok.get("expires_in", 3600)) - 60
        self.store.set_setting("gdrive_tokens", tok)
        if not self.store.get("sources", SOURCE_ID):
            self.memory.add_source("gdrive", "Google Drive", sid=SOURCE_ID)
        try:
            about = await self._get("/about", {"fields": "user(emailAddress,displayName)"})
            tok["email"] = about.get("user", {}).get("emailAddress", "")
            self.store.set_setting("gdrive_tokens", tok)
        except DriveError:
            pass
        return tok

    async def _access_token(self) -> str:
        tok = self.tokens()
        if not tok:
            raise DriveError("Google Drive is not connected.")
        if tok.get("expires_at", 0) > time.time() and tok.get("access_token"):
            return tok["access_token"]
        if not tok.get("refresh_token"):
            raise DriveError("Google session expired — please reconnect Google Drive.")
        async with self._client() as c:
            r = await c.post(TOKEN_URL, data={"client_id": self.client_id, "client_secret": self.client_secret,
                                              "refresh_token": tok["refresh_token"], "grant_type": "refresh_token"})
        if r.status_code >= 400:
            raise DriveError("Google session expired — please reconnect Google Drive.")
        new = r.json()
        tok.update(access_token=new["access_token"], expires_at=time.time() + int(new.get("expires_in", 3600)) - 60)
        self.store.set_setting("gdrive_tokens", tok)
        return tok["access_token"]

    async def _get(self, path: str, params: Optional[Dict[str, Any]] = None, raw: bool = False):
        token = await self._access_token()
        async with self._client() as c:
            r = await c.get(f"{API}{path}", params=params or {}, headers={"Authorization": f"Bearer {token}"})
        if r.status_code >= 400:
            raise DriveError(f"Drive API error {r.status_code}: {r.text[:200]}")
        return r.content if raw else r.json()

    def disconnect(self) -> None:
        self.store.set_setting("gdrive_tokens", {})
        self.store.set_setting("gdrive_folders", [])
        if self.store.get("sources", SOURCE_ID):
            self.memory.remove_source(SOURCE_ID)
            self.store.delete("sources", SOURCE_ID)

    # ------------------------------------------------------------ browsing
    async def list_folders(self, parent: str = "root") -> List[Dict[str, str]]:
        q = f"'{parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        data = await self._get("/files", {"q": q, "fields": "files(id,name)", "pageSize": 200, "orderBy": "name"})
        return [{"id": f["id"], "name": f["name"]} for f in data.get("files", [])]

    def set_folders(self, folders: List[Dict[str, str]]) -> None:
        self.store.set_setting("gdrive_folders", [{"id": f["id"], "name": f.get("name", "")} for f in folders])

    async def _walk(self, folder_id: str, depth: int = 0, seen: Optional[set] = None) -> List[Dict[str, Any]]:
        seen = seen if seen is not None else set()
        if folder_id in seen or depth > 5:
            return []
        seen.add(folder_id)
        files, token = [], None
        while True:
            params = {"q": f"'{folder_id}' in parents and trashed = false", "pageSize": 200,
                      "fields": "nextPageToken, files(id,name,mimeType,modifiedTime,size,webViewLink)"}
            if token:
                params["pageToken"] = token
            data = await self._get("/files", params)
            for f in data.get("files", []):
                if f["mimeType"] == "application/vnd.google-apps.folder":
                    files.extend(await self._walk(f["id"], depth + 1, seen))
                else:
                    files.append(f)
            token = data.get("nextPageToken")
            if not token:
                break
        return files

    async def _read(self, f: Dict[str, Any]) -> str:
        mime = f["mimeType"]
        if mime in EXPORTS:
            data = await self._get(f"/files/{f['id']}/export", {"mimeType": EXPORTS[mime]}, raw=True)
            return data.decode("utf8", "ignore")
        if mime.startswith(DOWNLOADABLE) and int(f.get("size") or 0) <= MAX_FILE_BYTES:
            data = await self._get(f"/files/{f['id']}", {"alt": "media"}, raw=True)
            return extract_text(data, f["name"], mime)
        return ""

    # ---------------------------------------------------------------- sync
    async def sync(self, on_progress=None) -> Dict[str, int]:
        if not self.folders():
            raise DriveError("Pick at least one Drive folder first.")
        if not self.store.get("sources", SOURCE_ID):
            self.memory.add_source("gdrive", "Google Drive", sid=SOURCE_ID)
        self.store.update("sources", SOURCE_ID, {"status": "syncing"})
        stats = {"seen": 0, "indexed": 0, "unchanged": 0, "skipped": 0, "removed": 0}
        try:
            files: List[Dict[str, Any]] = []
            for folder in self.folders():
                files.extend(await self._walk(folder["id"]))
            live_ids = set()
            for f in files:
                stats["seen"] += 1
                live_ids.add(f["id"])
                existing = self.memory.find_document(SOURCE_ID, f["id"])
                if existing and existing.get("modified") == f.get("modifiedTime"):
                    stats["unchanged"] += 1
                    continue
                text = await self._read(f)
                if not text.strip():
                    stats["skipped"] += 1
                    continue
                self.memory.add_document(SOURCE_ID, f["name"], text, mime=f["mimeType"], url=f.get("webViewLink", ""),
                                         external_id=f["id"], modified=f.get("modifiedTime", ""))
                # the hash check inside add_document may keep the old doc; make sure modified is current
                doc = self.memory.find_document(SOURCE_ID, f["id"])
                if doc:
                    self.store.update("documents", doc["id"], {"modified": f.get("modifiedTime", "")})
                stats["indexed"] += 1
                if on_progress:
                    on_progress(stats)
            for doc in self.store.query("SELECT id, external_id FROM documents WHERE source_id = ?", [SOURCE_ID]):
                if doc["external_id"] not in live_ids:
                    self.memory.remove_document(doc["id"])
                    stats["removed"] += 1
            self.store.update("sources", SOURCE_ID, {"status": "ready", "last_sync": now()})
        except Exception:
            self.store.update("sources", SOURCE_ID, {"status": "error"})
            raise
        return stats
