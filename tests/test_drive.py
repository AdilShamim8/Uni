"""Google Drive connector: OAuth flow + incremental sync, all over a MockTransport."""
from __future__ import annotations

import asyncio
import re
import time
from urllib.parse import parse_qsl

import httpx
import pytest

from rewoo.connectors.gdrive import API, TOKEN_URL, GoogleDrive


def make_world():
    """Mutable state the fake Drive API reads from / is asserted against."""
    return {
        "token_calls": [],
        "access_token": "tok1",
        "listing": {
            "folder1": [
                {"id": "doc1", "name": "Doc One", "mimeType": "application/vnd.google-apps.document",
                 "modifiedTime": "2024-01-01T00:00:00Z", "webViewLink": "https://docs.google.com/doc1"},
                {"id": "folder2", "name": "Sub", "mimeType": "application/vnd.google-apps.folder",
                 "modifiedTime": "2024-01-01T00:00:00Z"},
                {"id": "img1", "name": "photo.png", "mimeType": "image/png", "size": "1000",
                 "modifiedTime": "2024-01-01T00:00:00Z"},
            ],
            "folder2": [
                {"id": "txt1", "name": "notes.txt", "mimeType": "text/plain", "size": "100",
                 "modifiedTime": "2024-01-01T00:00:00Z"},
            ],
        },
        "exports": {"doc1": "Exported Google Doc content."},
        "media": {"txt1": b"Plain text file content."},
    }


def make_handler(world):
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/token":
            body = dict(parse_qsl(request.content.decode()))
            world["token_calls"].append(body)
            if body.get("grant_type") == "authorization_code":
                return httpx.Response(200, json={"access_token": "tok1", "refresh_token": "reftok1", "expires_in": 3600})
            if body.get("grant_type") == "refresh_token":
                return httpx.Response(200, json={"access_token": "tok2", "expires_in": 3600})
            return httpx.Response(400, json={"error": "unsupported grant"})

        auth = request.headers.get("authorization", "")
        assert auth.startswith("Bearer "), f"missing bearer token for {path}"

        if path == "/drive/v3/about":
            return httpx.Response(200, json={"user": {"emailAddress": "me@example.com"}})

        m = re.match(r"^/drive/v3/files/([^/]+)/export$", path)
        if m:
            fid = m.group(1)
            return httpx.Response(200, content=world["exports"][fid].encode())

        m = re.match(r"^/drive/v3/files/([^/]+)$", path)
        if m and request.url.params.get("alt") == "media":
            fid = m.group(1)
            return httpx.Response(200, content=world["media"][fid])

        if path == "/drive/v3/files":
            q = request.url.params.get("q", "")
            parent = re.search(r"'([^']+)' in parents", q).group(1)
            return httpx.Response(200, json={"files": world["listing"].get(parent, [])})

        return httpx.Response(404, json={"error": f"unhandled {path}"})

    return handler


def make_drive(rw, world, tokens_ready=True):
    transport = httpx.MockTransport(make_handler(world))
    drive = GoogleDrive(rw.store, rw.memory, "client-id", "client-secret",
                        redirect_uri="https://app.example/api/drive/callback", transport=transport)
    if tokens_ready:
        rw.store.set_setting("gdrive_tokens", {"access_token": world["access_token"], "refresh_token": "reftok1",
                                                "expires_at": time.time() + 3600})
    return drive


# --------------------------------------------------------------------------- OAuth
def test_auth_url_contains_scope_and_state(rw):
    world = make_world()
    drive = make_drive(rw, world, tokens_ready=False)
    url = drive.auth_url("state123")
    assert "drive.readonly" in url
    assert "state=state123" in url


def test_auth_url_raises_when_not_configured(rw):
    world = make_world()
    transport = httpx.MockTransport(make_handler(world))
    drive = GoogleDrive(rw.store, rw.memory, "", "", redirect_uri="https://app.example/callback", transport=transport)
    with pytest.raises(Exception):
        drive.auth_url("s")


def test_exchange_code_stores_tokens(rw):
    world = make_world()
    drive = make_drive(rw, world, tokens_ready=False)
    tok = asyncio.run(drive.exchange_code("authcode123"))
    assert tok["access_token"] == "tok1"
    assert tok["refresh_token"] == "reftok1"
    assert drive.tokens()["email"] == "me@example.com"
    assert drive.connected() is True
    assert rw.store.get("sources", "src_gdrive") is not None
    assert world["token_calls"][0]["grant_type"] == "authorization_code"


def test_expired_token_triggers_refresh(rw):
    world = make_world()
    drive = make_drive(rw, world, tokens_ready=False)
    rw.store.set_setting("gdrive_tokens", {"access_token": "stale", "refresh_token": "reftok1", "expires_at": time.time() - 10})
    token = asyncio.run(drive._access_token())
    assert token == "tok2"
    assert drive.tokens()["access_token"] == "tok2"
    assert any(c.get("grant_type") == "refresh_token" for c in world["token_calls"])


# --------------------------------------------------------------------------- sync
def test_sync_indexes_folder_recursively_and_skips_images(rw):
    world = make_world()
    drive = make_drive(rw, world)
    drive.set_folders([{"id": "folder1", "name": "Root"}])
    stats = asyncio.run(drive.sync())
    assert stats["seen"] == 3
    assert stats["indexed"] == 2
    assert stats["skipped"] == 1
    assert stats["unchanged"] == 0
    assert stats["removed"] == 0
    docs = rw.memory.documents("src_gdrive")
    titles = {d["title"] for d in docs}
    assert titles == {"Doc One", "notes.txt"}


def test_sync_second_run_reports_unchanged(rw):
    world = make_world()
    drive = make_drive(rw, world)
    drive.set_folders([{"id": "folder1", "name": "Root"}])
    asyncio.run(drive.sync())
    stats2 = asyncio.run(drive.sync())
    assert stats2["unchanged"] == 2
    assert stats2["indexed"] == 0
    assert stats2["skipped"] == 1


def test_sync_modified_file_is_reindexed(rw):
    world = make_world()
    drive = make_drive(rw, world)
    drive.set_folders([{"id": "folder1", "name": "Root"}])
    asyncio.run(drive.sync())

    world["listing"]["folder2"][0]["modifiedTime"] = "2024-06-01T00:00:00Z"
    world["media"]["txt1"] = b"Updated plain text content."
    stats3 = asyncio.run(drive.sync())
    assert stats3["indexed"] == 1
    assert stats3["unchanged"] == 1

    doc = rw.memory.find_document("src_gdrive", "txt1")
    read = rw.memory.read_document(doc["id"])
    assert "Updated plain text content." in read["text"]


def test_sync_deleted_file_is_removed(rw):
    world = make_world()
    drive = make_drive(rw, world)
    drive.set_folders([{"id": "folder1", "name": "Root"}])
    asyncio.run(drive.sync())

    world["listing"]["folder1"] = [f for f in world["listing"]["folder1"] if f["id"] != "doc1"]
    stats = asyncio.run(drive.sync())
    assert stats["removed"] == 1
    assert rw.memory.find_document("src_gdrive", "doc1") is None
