"""HTTP API + static web app.

Everything the UI does goes through these endpoints, so ReWoo is also fully
scriptable. Live task progress streams over Server-Sent Events.
"""
from __future__ import annotations

import asyncio
import json
import secrets
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .. import __version__
from ..connectors.gdrive import DriveError
from ..core import ReWoo
from ..memory.store import safe_filename
from ..memory.text import extract_text
from ..models.router import PRESETS, PROVIDER_TYPES
from ..recipes import render
from ..tools.registry import APPROVAL_MODES

def _dump(model: BaseModel) -> Dict[str, Any]:
    """Pydantic v1/v2 compatible model → dict."""
    return model.model_dump() if hasattr(model, "model_dump") else model.dict()


WEB_DIR = Path(__file__).resolve().parent.parent / "web"
TERMINAL = {"answer", "done", "error", "stopped", "cancelled", "interrupted"}


class TaskIn(BaseModel):
    prompt: str
    helper_id: str = "woo"
    profile: Optional[str] = None


class RecipeRun(BaseModel):
    inputs: Dict[str, str] = {}


class Decision(BaseModel):
    approve: bool


class FactIn(BaseModel):
    text: str
    pinned: bool = False


class FactPatch(BaseModel):
    text: Optional[str] = None
    pinned: Optional[bool] = None


class SourcePatch(BaseModel):
    enabled: Optional[bool] = None
    private: Optional[bool] = None
    name: Optional[str] = None


class SearchIn(BaseModel):
    query: str


class ProviderIn(BaseModel):
    id: str
    type: str
    name: str = ""
    base_url: str = ""
    api_key: Optional[str] = None
    model: str = ""
    embed_model: str = ""
    local: bool = False
    enabled: bool = True
    price_in: float = 0.0
    price_out: float = 0.0


class HelperIn(BaseModel):
    name: str
    emoji: str = "✨"
    color: str = "#7C5CFF"
    tagline: str = ""
    instructions: str = ""
    tools: List[str] = []
    profile: str = "balanced"


class FoldersIn(BaseModel):
    folders: List[Dict[str, str]]


SETTING_KEYS = {"user_name", "approval_mode", "budgets", "context_tokens", "default_provider", "fallbacks",
                "memory_paused", "onboarded", "google_client_id", "google_client_secret", "embedder"}


def create_app(rewoo: Optional[ReWoo] = None) -> FastAPI:
    rw = rewoo or ReWoo()
    app = FastAPI(title="ReWoo", version=__version__, description="Personal AI Agent OS")
    app.state.rewoo = rw
    oauth_states: set = set()

    @app.on_event("startup")
    async def _startup():
        rw.runtime.recover()

    # ------------------------------------------------------------ overview
    @app.get("/api/health")
    def health():
        return {"ok": True, "version": __version__}

    @app.get("/api/overview")
    def overview():
        primary = rw.router.primary()
        recent = rw.store.query("SELECT id, title, status, helper_id, created_at FROM tasks ORDER BY created_at DESC LIMIT 8")
        pending = rw.store.query("SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at")
        return {
            "version": __version__, "user_name": rw.store.get_setting("user_name", ""),
            "onboarded": rw.store.get_setting("onboarded", False),
            "brain": {"id": primary.id, "name": primary.spec.name or primary.id, "model": primary.spec.model, "on_device": primary.is_local,
                      "is_demo": primary.spec.type == "demo"},
            "memory": rw.memory.stats(), "memory_paused": rw.store.get_setting("memory_paused", False),
            "drive": rw.drive.status(), "recent_tasks": recent, "pending_approvals": pending,
        }

    # ------------------------------------------------------------ settings
    @app.get("/api/settings")
    def get_settings():
        return {
            "user_name": rw.store.get_setting("user_name", ""),
            "approval_mode": rw.store.get_setting("approval_mode", "balanced"),
            "approval_modes": {k: sorted(v) for k, v in APPROVAL_MODES.items()},
            "budgets": {"max_steps": 8, "max_tokens": 60000, "max_cost_usd": 0.5, **(rw.store.get_setting("budgets", {}) or {})},
            "context_tokens": rw.store.get_setting("context_tokens", 2500),
            "default_provider": rw.store.get_setting("default_provider", "demo"),
            "fallbacks": rw.store.get_setting("fallbacks", []),
            "memory_paused": rw.store.get_setting("memory_paused", False),
            "onboarded": rw.store.get_setting("onboarded", False),
            "embedder": rw.store.get_setting("embedder", "local"),
            "google_client_id": rw.drive.client_id,
            "google_client_secret_set": bool(rw.drive.client_secret),
        }

    @app.put("/api/settings")
    def put_settings(body: Dict[str, Any]):
        for k, v in body.items():
            if k not in SETTING_KEYS:
                continue
            if k == "approval_mode" and v not in APPROVAL_MODES:
                raise HTTPException(400, "Unknown approval mode")
            if k == "google_client_secret" and not v:
                continue
            rw.store.set_setting(k, v)
        return get_settings()

    # ----------------------------------------------------------- providers
    @app.get("/api/providers")
    def providers():
        default = rw.store.get_setting("default_provider", "demo")
        return {"providers": [{**s.public(), "is_default": s.id == default} for s in rw.router.specs()],
                "presets": PRESETS, "types": list(PROVIDER_TYPES)}

    @app.post("/api/providers")
    def save_provider(body: ProviderIn):
        try:
            spec = rw.router.save_spec(_dump(body))
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        return spec.public()

    @app.delete("/api/providers/{pid}")
    def delete_provider(pid: str):
        if pid == "demo":
            raise HTTPException(400, "The demo brain can't be removed")
        rw.router.remove_spec(pid)
        return {"ok": True}

    @app.post("/api/providers/{pid}/test")
    async def test_provider(pid: str):
        p = rw.router.get(pid)
        if not p:
            raise HTTPException(404, "No such brain")
        return await p.health()

    # ------------------------------------------------------------- helpers
    @app.get("/api/helpers")
    def helpers():
        return {"helpers": rw.helpers.all(), "tools": [t.public() for t in rw.tools.all()]}

    @app.post("/api/helpers")
    def create_helper(body: HelperIn):
        return rw.helpers.create(_dump(body))

    @app.put("/api/helpers/{hid}")
    def update_helper(hid: str, body: HelperIn):
        rw.helpers.update(hid, _dump(body))
        return rw.helpers.get(hid)

    @app.delete("/api/helpers/{hid}")
    def delete_helper(hid: str):
        rw.helpers.delete(hid)
        return {"ok": True}

    # ------------------------------------------------------------- recipes
    @app.get("/api/recipes")
    def recipes():
        return {"recipes": rw.recipes()}

    @app.post("/api/recipes/{rid}/run")
    async def run_recipe(rid: str, body: RecipeRun):
        recipe = next((r for r in rw.recipes() if r["id"] == rid), None)
        if not recipe:
            raise HTTPException(404, "No such recipe")
        try:
            prompt = render(recipe, body.inputs)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        task = rw.runtime.create_task(prompt, recipe.get("helper", "woo"), recipe_id=rid)
        rw.runtime.start(task["id"])
        return task

    # --------------------------------------------------------------- tasks
    @app.post("/api/tasks")
    async def create_task(body: TaskIn):
        if not body.prompt.strip():
            raise HTTPException(400, "Tell me what you need first 🙂")
        task = rw.runtime.create_task(body.prompt, body.helper_id, body.profile)
        rw.runtime.start(task["id"])
        return task

    @app.get("/api/tasks")
    def list_tasks(limit: int = 50):
        return {"tasks": rw.store.query("SELECT id, title, status, helper_id, created_at, updated_at, usage FROM tasks ORDER BY created_at DESC LIMIT ?", [limit])}

    @app.get("/api/tasks/{tid}")
    def get_task(tid: str):
        task = rw.store.get("tasks", tid)
        if not task:
            raise HTTPException(404, "No such task")
        return {"task": task, "events": rw.bus.history(tid)}

    @app.post("/api/tasks/{tid}/cancel")
    def cancel_task(tid: str):
        rw.runtime.cancel(tid)
        return {"ok": True}

    @app.delete("/api/tasks/{tid}")
    def delete_task(tid: str):
        rw.runtime.cancel(tid)
        rw.store.execute("DELETE FROM events WHERE task_id = ?", [tid])
        rw.store.delete("tasks", tid)
        return {"ok": True}

    @app.get("/api/tasks/{tid}/stream")
    async def stream(tid: str, request: Request, after: int = 0):
        q = rw.bus.subscribe(tid)

        async def gen():
            try:
                last = after
                for ev in rw.bus.history(tid, after):
                    last = ev["seq"]
                    yield f"data: {json.dumps(ev, default=str)}\n\n"
                task = rw.store.get("tasks", tid)
                if task and task["status"] in ("done", "failed", "stopped", "cancelled", "interrupted"):
                    yield "event: end\ndata: {}\n\n"
                    return
                while True:
                    if await request.is_disconnected():
                        return
                    try:
                        ev = await asyncio.wait_for(q.get(), timeout=15)
                    except asyncio.TimeoutError:
                        yield ": keep-alive\n\n"
                        continue
                    if ev["seq"] <= last:
                        continue
                    last = ev["seq"]
                    yield f"data: {json.dumps(ev, default=str)}\n\n"
                    if ev["type"] in TERMINAL - {"answer"}:
                        yield "event: end\ndata: {}\n\n"
                        return
            finally:
                rw.bus.unsubscribe(tid, q)

        return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @app.post("/api/approvals/{aid}")
    def decide(aid: str, body: Decision):
        if not rw.runtime.decide(aid, body.approve):
            raise HTTPException(409, "This request was already answered or has expired.")
        return {"ok": True}

    # -------------------------------------------------------------- memory
    @app.get("/api/memory")
    def memory_overview():
        return {"sources": rw.memory.sources(), "facts": rw.memory.facts(), "stats": rw.memory.stats(),
                "paused": rw.store.get_setting("memory_paused", False)}

    @app.patch("/api/memory/sources/{sid}")
    def patch_source(sid: str, body: SourcePatch):
        rw.memory.update_source(sid, **{k: v for k, v in _dump(body).items() if v is not None})
        return {"ok": True}

    @app.delete("/api/memory/sources/{sid}")
    def delete_source(sid: str):
        if sid == "src_gdrive":
            rw.drive.disconnect()
        else:
            rw.memory.remove_source(sid)
        return {"ok": True}

    @app.get("/api/memory/sources/{sid}/documents")
    def source_docs(sid: str):
        return {"documents": rw.memory.documents(sid)}

    @app.delete("/api/memory/documents/{did}")
    def delete_doc(did: str):
        rw.memory.remove_document(did)
        return {"ok": True}

    @app.post("/api/memory/upload")
    async def upload(files: List[UploadFile] = File(...)):
        results = []
        for f in files:
            data = await f.read()
            if len(data) > 25 * 1024 * 1024:
                results.append({"name": f.filename, "ok": False, "reason": "File is larger than 25 MB"})
                continue
            text = extract_text(data, f.filename or "", f.content_type or "")
            if not text.strip():
                results.append({"name": f.filename, "ok": False, "reason": "I couldn't read text from this file"})
                continue
            rw.config.upload_dir.mkdir(parents=True, exist_ok=True)
            (rw.config.upload_dir / safe_filename(f.filename or "file")).write_bytes(data)
            embeddings = None
            try:
                from ..memory.text import chunk_text
                embeddings = await rw.router.embed([f"{f.filename}\n{c}" for c in chunk_text(text)])
            except Exception:  # noqa: BLE001 - fall back to local embeddings
                embeddings = None
            doc = rw.memory.add_document("src_uploads", f.filename or "Upload", text, mime=f.content_type or "",
                                         external_id=f"upload:{f.filename}", embeddings=embeddings)
            results.append({"name": f.filename, "ok": True, "doc_id": doc["id"] if doc else None, "chars": len(text)})
        return {"results": results}

    @app.post("/api/memory/search")
    async def memory_search(body: SearchIn):
        """'What would ReWoo see?' — preview retrieval + the context receipt."""
        remote = not rw.router.primary().is_local
        pack = rw.runtime.context.build(body.query, remote=remote)
        return pack.receipt()

    @app.get("/api/memory/facts")
    def facts():
        return {"facts": rw.memory.facts()}

    @app.post("/api/memory/facts")
    def add_fact(body: FactIn):
        return rw.memory.add_fact(body.text, pinned=body.pinned)

    @app.patch("/api/memory/facts/{fid}")
    def patch_fact(fid: str, body: FactPatch):
        rw.memory.update_fact(fid, **{k: v for k, v in _dump(body).items() if v is not None})
        return {"ok": True}

    @app.delete("/api/memory/facts/{fid}")
    def forget_fact(fid: str):
        rw.memory.forget_fact(fid)
        return {"ok": True}

    @app.post("/api/memory/pause")
    def pause(body: Dict[str, bool]):
        rw.store.set_setting("memory_paused", bool(body.get("paused")))
        return {"paused": rw.store.get_setting("memory_paused")}

    # --------------------------------------------------------------- drive
    @app.get("/api/drive/status")
    def drive_status():
        return rw.drive.status()

    @app.get("/api/drive/connect")
    def drive_connect():
        state = secrets.token_urlsafe(16)
        oauth_states.add(state)
        try:
            return RedirectResponse(rw.drive.auth_url(state))
        except DriveError as exc:
            return HTMLResponse(f"<p>{exc}</p><p><a href='/#/memory'>Back to ReWoo</a></p>", status_code=400)

    @app.get("/api/drive/callback")
    async def drive_callback(code: str = "", state: str = "", error: str = ""):
        if error or not code or state not in oauth_states:
            return RedirectResponse("/#/memory?drive=error")
        oauth_states.discard(state)
        try:
            await rw.drive.exchange_code(code)
        except DriveError:
            return RedirectResponse("/#/memory?drive=error")
        return RedirectResponse("/#/memory?drive=connected")

    @app.get("/api/drive/folders")
    async def drive_folders(parent: str = "root"):
        try:
            return {"folders": await rw.drive.list_folders(parent), "selected": rw.drive.folders()}
        except DriveError as exc:
            raise HTTPException(400, str(exc))

    @app.post("/api/drive/folders")
    def drive_set_folders(body: FoldersIn):
        rw.drive.set_folders(body.folders)
        return rw.drive.status()

    @app.post("/api/drive/sync")
    async def drive_sync():
        try:
            return {"stats": await rw.drive.sync(), "status": rw.drive.status()}
        except DriveError as exc:
            raise HTTPException(400, str(exc))

    @app.post("/api/drive/disconnect")
    def drive_disconnect():
        rw.drive.disconnect()
        return rw.drive.status()

    # ------------------------------------------------------------- library
    @app.get("/api/library")
    def library():
        return {
            "todos": rw.store.query("SELECT * FROM todos ORDER BY done, created_at DESC"),
            "notes": rw.store.query("SELECT * FROM notes ORDER BY created_at DESC"),
            "drafts": rw.store.query("SELECT * FROM drafts ORDER BY created_at DESC"),
        }

    @app.patch("/api/library/todos/{tid}")
    def toggle_todo(tid: str, body: Dict[str, bool]):
        rw.store.update("todos", tid, {"done": int(bool(body.get("done")))})
        return {"ok": True}

    @app.delete("/api/library/{kind}/{iid}")
    def delete_item(kind: str, iid: str):
        if kind not in ("todos", "notes", "drafts"):
            raise HTTPException(404, "Unknown kind")
        if kind == "notes":
            doc = rw.memory.find_document("src_notes", iid)
            if doc:
                rw.memory.remove_document(doc["id"])
        rw.store.delete(kind, iid)
        return {"ok": True}

    # ---------------------------------------------------------------- web
    if WEB_DIR.exists():
        app.mount("/assets", StaticFiles(directory=WEB_DIR / "assets"), name="assets")

        @app.get("/")
        def index():
            return FileResponse(WEB_DIR / "index.html")

        @app.get("/{name}.{ext}")
        def web_file(name: str, ext: str):
            path = WEB_DIR / f"{name}.{ext}"
            if ext in ("js", "css", "svg", "ico", "webmanifest") and path.exists():
                return FileResponse(path)
            return JSONResponse({"detail": "Not found"}, status_code=404)

    return app
