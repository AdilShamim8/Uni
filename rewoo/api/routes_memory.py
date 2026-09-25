"""Memory, Google Drive and Library endpoints."""
from __future__ import annotations

import secrets
import time
from typing import Dict, List

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse

from ..connectors.gdrive import DriveError
from ..memory.store import safe_filename
from ..memory.text import chunk_text, extract_text, extraction_hint
from .schemas import FactIn, FactPatch, FoldersIn, SearchIn, SourcePatch, dump

MAX_UPLOAD = 25 * 1024 * 1024
OAUTH_TTL = 600  # seconds a Google sign-in may take
OAUTH_MAX = 50   # never keep more than this many pending sign-ins


class OAuthStates:
    """Bounded, expiring store for OAuth `state` values (no unbounded growth)."""

    def __init__(self):
        self._states: Dict[str, float] = {}

    def _prune(self) -> None:
        cutoff = time.time() - OAUTH_TTL
        for k in [k for k, t in self._states.items() if t < cutoff]:
            self._states.pop(k, None)
        while len(self._states) >= OAUTH_MAX:
            self._states.pop(min(self._states, key=self._states.get))

    def new(self) -> str:
        self._prune()
        state = secrets.token_urlsafe(16)
        self._states[state] = time.time()
        return state

    def consume(self, state: str) -> bool:
        self._prune()
        return self._states.pop(state, None) is not None

    def __len__(self) -> int:
        return len(self._states)


def build(rw) -> APIRouter:
    r = APIRouter()
    oauth = OAuthStates()
    r.oauth_states = oauth  # type: ignore[attr-defined]  (exposed for tests)

    @r.get("/api/memory")
    def memory_overview():
        return {"sources": rw.memory.sources(), "facts": rw.memory.facts(), "stats": rw.memory.stats(),
                "paused": rw.store.get_setting("memory_paused", False)}

    @r.patch("/api/memory/sources/{sid}")
    def patch_source(sid: str, body: SourcePatch):
        if not rw.store.get("sources", sid):
            raise HTTPException(404, "No such source")
        rw.memory.update_source(sid, **{k: v for k, v in dump(body).items() if v is not None})
        return {"ok": True}

    @r.delete("/api/memory/sources/{sid}")
    def delete_source(sid: str):
        if sid == "src_gdrive":
            rw.drive.disconnect()
        else:
            rw.memory.remove_source(sid)
        return {"ok": True}

    @r.get("/api/memory/sources/{sid}/documents")
    def source_docs(sid: str):
        return {"documents": rw.memory.documents(sid)}

    @r.delete("/api/memory/documents/{did}")
    def delete_doc(did: str):
        rw.memory.remove_document(did)
        return {"ok": True}

    @r.post("/api/memory/upload")
    async def upload(files: List[UploadFile] = File(...)):
        results = []
        for f in files:
            data = await f.read()
            name = f.filename or "file"
            if len(data) > MAX_UPLOAD:
                results.append({"name": name, "ok": False, "reason": "File is larger than 25 MB"})
                continue
            text = extract_text(data, name, f.content_type or "")
            if not text.strip():
                results.append({"name": name, "ok": False, "reason": extraction_hint(name)})
                continue
            rw.config.upload_dir.mkdir(parents=True, exist_ok=True)
            (rw.config.upload_dir / safe_filename(name)).write_bytes(data)
            try:
                embeddings = await rw.router.embed([f"{name}\n{c}" for c in chunk_text(text)])
            except Exception:  # noqa: BLE001 - fall back to local embeddings
                embeddings = None
            doc = rw.memory.add_document("src_uploads", name, text, mime=f.content_type or "",
                                         external_id=f"upload:{name}", embeddings=embeddings)
            results.append({"name": name, "ok": True, "doc_id": doc["id"] if doc else None, "chars": len(text)})
        return {"results": results}

    @r.post("/api/memory/search")
    async def memory_search(body: SearchIn):
        """'What would ReWoo see?' — preview retrieval + the context receipt."""
        remote = not rw.router.primary().is_local
        return rw.runtime.context.build(body.query, remote=remote).receipt()

    @r.get("/api/memory/facts")
    def facts():
        return {"facts": rw.memory.facts()}

    @r.post("/api/memory/facts")
    def add_fact(body: FactIn):
        if not body.text.strip():
            raise HTTPException(400, "Nothing to remember")
        return rw.memory.add_fact(body.text, pinned=body.pinned, bot_id=body.bot_id)

    @r.patch("/api/memory/facts/{fid}")
    def patch_fact(fid: str, body: FactPatch):
        rw.memory.update_fact(fid, **{k: v for k, v in dump(body).items() if v is not None})
        return {"ok": True}

    @r.delete("/api/memory/facts/{fid}")
    def forget_fact(fid: str):
        rw.memory.forget_fact(fid)
        return {"ok": True}

    @r.post("/api/memory/pause")
    def pause(body: Dict[str, bool]):
        rw.store.set_setting("memory_paused", bool(body.get("paused")))
        return {"paused": rw.store.get_setting("memory_paused")}

    # --------------------------------------------------------------- drive
    @r.get("/api/drive/status")
    def drive_status():
        return rw.drive.status()

    @r.get("/api/drive/connect")
    def drive_connect():
        try:
            return RedirectResponse(rw.drive.auth_url(oauth.new()))
        except DriveError as exc:
            return HTMLResponse(f"<p>{exc}</p><p><a href='/memory'>Back to ReWoo</a></p>", status_code=400)

    @r.get("/api/drive/callback")
    async def drive_callback(code: str = "", state: str = "", error: str = ""):
        if error or not code or not oauth.consume(state):
            return RedirectResponse("/memory?drive=error")
        try:
            await rw.drive.exchange_code(code)
        except DriveError:
            return RedirectResponse("/memory?drive=error")
        return RedirectResponse("/memory?drive=connected")

    @r.get("/api/drive/folders")
    async def drive_folders(parent: str = "root"):
        try:
            return {"folders": await rw.drive.list_folders(parent), "selected": rw.drive.folders()}
        except DriveError as exc:
            raise HTTPException(400, str(exc))

    @r.post("/api/drive/folders")
    def drive_set_folders(body: FoldersIn):
        rw.drive.set_folders(body.folders)
        return rw.drive.status()

    @r.post("/api/drive/sync")
    async def drive_sync():
        try:
            return {"stats": await rw.drive.sync(), "status": rw.drive.status()}
        except DriveError as exc:
            raise HTTPException(400, str(exc))

    @r.post("/api/drive/disconnect")
    def drive_disconnect():
        rw.drive.disconnect()
        return rw.drive.status()

    # ------------------------------------------------------------- library
    @r.get("/api/library")
    def library():
        return {
            "todos": rw.store.query("SELECT * FROM todos ORDER BY done, created_at DESC"),
            "notes": rw.store.query("SELECT * FROM notes ORDER BY created_at DESC"),
            "drafts": rw.store.query("SELECT * FROM drafts ORDER BY created_at DESC"),
        }

    @r.patch("/api/library/todos/{tid}")
    def toggle_todo(tid: str, body: Dict[str, bool]):
        rw.store.update("todos", tid, {"done": int(bool(body.get("done")))})
        return {"ok": True}

    @r.delete("/api/library/{kind}/{iid}")
    def delete_item(kind: str, iid: str):
        if kind not in ("todos", "notes", "drafts"):
            raise HTTPException(404, "Unknown kind")
        if kind == "notes":
            doc = rw.memory.find_document("src_notes", iid)
            if doc:
                rw.memory.remove_document(doc["id"])
        rw.store.delete(kind, iid)
        return {"ok": True}

    return r
