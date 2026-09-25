"""HTTP API surface: TestClient smoke tests across health, tasks, memory, settings,
providers, recipes and library endpoints."""
from __future__ import annotations

import time


def wait_for_status(client, task_id, timeout=10.0):
    deadline = time.time() + timeout
    status = None
    while time.time() < deadline:
        r = client.get(f"/api/tasks/{task_id}")
        assert r.status_code == 200
        status = r.json()["task"]["status"]
        if status in ("done", "failed", "stopped", "cancelled", "interrupted"):
            return status
        time.sleep(0.1)
    return status


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_overview(client):
    r = client.get("/api/overview")
    assert r.status_code == 200
    body = r.json()
    assert body["brain"]["is_demo"] is True
    assert "memory" in body and "drive" in body


def test_create_task_and_poll_until_done(client):
    r = client.post("/api/tasks", json={"prompt": "What's today's date?"})
    assert r.status_code == 200
    task_id = r.json()["id"]
    status = wait_for_status(client, task_id)
    assert status == "done"
    r2 = client.get(f"/api/tasks/{task_id}")
    assert r2.json()["task"]["result"]


def test_create_task_empty_prompt_rejected(client):
    r = client.post("/api/tasks", json={"prompt": "   "})
    assert r.status_code == 400


def test_upload_then_search_finds_it(client):
    files = {"files": ("note.txt", b"The secret project codename is BlueFalcon.", "text/plain")}
    r = client.post("/api/memory/upload", files=files)
    assert r.status_code == 200
    body = r.json()["results"][0]
    assert body["ok"] is True

    r2 = client.post("/api/memory/search", json={"query": "BlueFalcon codename"})
    assert r2.status_code == 200
    used_titles = [item["title"] for item in r2.json()["used"]]
    assert "note.txt" in used_titles


def test_facts_crud(client):
    r = client.post("/api/memory/facts", json={"text": "I like tea", "pinned": True})
    assert r.status_code == 200
    fid = r.json()["id"]

    r2 = client.get("/api/memory/facts")
    assert any(f["id"] == fid for f in r2.json()["facts"])

    r3 = client.patch(f"/api/memory/facts/{fid}", json={"text": "I like coffee"})
    assert r3.status_code == 200
    r4 = client.get("/api/memory/facts")
    assert any(f["id"] == fid and f["text"] == "I like coffee" for f in r4.json()["facts"])

    r5 = client.delete(f"/api/memory/facts/{fid}")
    assert r5.status_code == 200
    r6 = client.get("/api/memory/facts")
    assert not any(f["id"] == fid for f in r6.json()["facts"])


def test_settings_rejects_bad_approval_mode(client):
    r = client.put("/api/settings", json={"approval_mode": "bogus-mode"})
    assert r.status_code == 400


def test_settings_accepts_known_approval_mode(client):
    r = client.put("/api/settings", json={"approval_mode": "cautious"})
    assert r.status_code == 200
    assert r.json()["approval_mode"] == "cautious"


def test_providers_list_includes_demo(client):
    r = client.get("/api/providers")
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()["providers"]]
    assert "demo" in ids


def test_providers_delete_demo_rejected(client):
    r = client.delete("/api/providers/demo")
    assert r.status_code == 400


def test_providers_save_masks_key_in_response(client):
    r = client.post("/api/providers", json={"id": "oa1", "type": "openai_compat", "api_key": "sk-abcdef123456", "model": "gpt-4o-mini"})
    assert r.status_code == 200
    body = r.json()
    assert "api_key" not in body
    assert body["has_key"] is True


def test_recipes_run_with_missing_field_returns_400(client):
    r = client.post("/api/recipes/brief-me/run", json={"inputs": {}})
    assert r.status_code == 400


def test_recipes_list(client):
    r = client.get("/api/recipes")
    assert r.status_code == 200
    ids = {rec["id"] for rec in r.json()["recipes"]}
    assert "brief-me" in ids


def test_library_endpoints(client):
    r = client.get("/api/library")
    assert r.status_code == 200
    body = r.json()
    assert body == {"todos": [], "notes": [], "drafts": []}


def test_helpers_list_includes_builtins(client):
    r = client.get("/api/helpers")
    assert r.status_code == 200
    ids = {h["id"] for h in r.json()["helpers"]}
    assert {"woo", "scout", "quill", "tally", "hush"} <= ids
