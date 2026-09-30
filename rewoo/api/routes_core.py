"""Core API: overview/board, settings, brains, Bots, recipes, threads, tasks, approvals, live streams."""
from __future__ import annotations

import asyncio
import json
import secrets
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from .. import __version__
from ..models.router import PRESETS, PROVIDER_TYPES
from ..recipes import render
from ..tools.registry import APPROVAL_MODES
from .schemas import BotIn, Decision, MessageIn, ProviderIn, RecipeRun, TaskIn, dump

TERMINAL_EVENTS = {"done", "error", "stopped", "cancelled", "interrupted"}
SETTING_KEYS = {"user_name", "approval_mode", "budgets", "context_tokens", "default_provider", "fallbacks",
                "memory_paused", "onboarded", "google_client_id", "google_client_secret", "embedder",
                "learning", "theme", "demo_typing_delay", "api_approval"}


def sse(gen):
    return StreamingResponse(gen, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})


def build(rw) -> APIRouter:
    r = APIRouter()

    def bot_view(h: Dict[str, Any]) -> Dict[str, Any]:
        act = dict(rw.bus.activity.get(h["id"]) or {})
        live = bool(act) and act.get("task_id") in rw.runtime.running()
        act.update(state=act.get("state", "working") if live else "idle", live=live)
        return {**h, "activity": act}

    # ------------------------------------------------------------ overview
    @r.get("/api/health")
    def health():
        return {"ok": True, "version": __version__}

    @r.get("/api/overview")
    def overview():
        primary = rw.router.primary()
        recent = rw.store.query("SELECT id, title, status, helper_id, thread_id, created_at FROM tasks ORDER BY created_at DESC LIMIT 8")
        pending = rw.store.query("""SELECT a.*, t.helper_id, t.thread_id, t.title FROM approvals a
                                    LEFT JOIN tasks t ON t.id = a.task_id WHERE a.status = 'pending' ORDER BY a.created_at""")
        return {
            "version": __version__, "user_name": rw.store.get_setting("user_name", ""),
            "onboarded": rw.store.get_setting("onboarded", False), "theme": rw.store.get_setting("theme", "night"),
            "brain": {"id": primary.id, "name": primary.spec.name or primary.id, "model": primary.spec.model,
                      "on_device": primary.is_local, "is_demo": primary.spec.type == "demo"},
            "memory": rw.memory.stats(), "memory_paused": rw.store.get_setting("memory_paused", False),
            "drive": rw.drive.status(), "recent_tasks": recent, "pending_approvals": pending,
            "proposed_skills": len(rw.skills.all("proposed")), "routines": len(rw.routines.all()),
            "running": len(rw.runtime.running()),
        }

    @r.get("/api/board")
    def board():
        """Live teammates grid: every Bot + what it's doing right now."""
        return {"bots": [bot_view(h) for h in rw.helpers.all()],
                "running": [rw.store.get("tasks", t) for t in rw.runtime.running()]}

    # ------------------------------------------------------------ settings
    def settings_view():
        key = rw.store.get_setting("api_key", "")
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
            "learning": rw.store.get_setting("learning", "ask"),
            "theme": rw.store.get_setting("theme", "night"),
            "api_approval": rw.store.get_setting("api_approval", "ask"),
            "google_client_id": rw.drive.client_id,
            "google_client_secret_set": bool(rw.drive.client_secret),
            "api_key_hint": f"{key[:6]}…{key[-4:]}" if key else "",
            "base_url": rw.config.base_url,
        }

    @r.get("/api/settings")
    def get_settings():
        return settings_view()

    @r.put("/api/settings")
    def put_settings(body: Dict[str, Any]):
        for k, v in body.items():
            if k not in SETTING_KEYS:
                continue
            if k == "approval_mode" and v not in APPROVAL_MODES:
                raise HTTPException(400, "Unknown approval mode")
            if k == "learning" and v not in ("ask", "off"):
                raise HTTPException(400, "learning must be 'ask' or 'off'")
            if k == "api_approval" and v not in ("ask", "off"):
                raise HTTPException(400, "api_approval must be 'ask' or 'off'")
            if k == "theme" and v not in ("night", "day"):
                raise HTTPException(400, "theme must be 'night' or 'day'")
            if k == "google_client_secret" and not v:
                continue
            if k == "context_tokens":
                try:
                    v = int(v)
                    if not (100 <= v <= 8000):
                        raise HTTPException(400, "context_tokens must be between 100 and 8000")
                except (TypeError, ValueError):
                    raise HTTPException(400, "context_tokens must be an integer")
            if k == "budgets" and isinstance(v, dict):
                allowed_budget_keys = {"max_steps", "max_tokens", "max_cost_usd"}
                for bk, bv in v.items():
                    if bk not in allowed_budget_keys:
                        raise HTTPException(400, f"Unknown budget key: {bk}")
                if "max_steps" in v:
                    try:
                        v["max_steps"] = int(v["max_steps"])
                        if not (1 <= v["max_steps"] <= 50):
                            raise HTTPException(400, "max_steps must be 1–50")
                    except (TypeError, ValueError):
                        raise HTTPException(400, "max_steps must be an integer")
                if "max_tokens" in v:
                    try:
                        v["max_tokens"] = int(v["max_tokens"])
                        if not (1000 <= v["max_tokens"] <= 200000):
                            raise HTTPException(400, "max_tokens must be 1,000–200,000")
                    except (TypeError, ValueError):
                        raise HTTPException(400, "max_tokens must be an integer")
                if "max_cost_usd" in v:
                    try:
                        v["max_cost_usd"] = float(v["max_cost_usd"])
                        if not (0 <= v["max_cost_usd"] <= 100):
                            raise HTTPException(400, "max_cost_usd must be 0–100")
                    except (TypeError, ValueError):
                        raise HTTPException(400, "max_cost_usd must be a number")
            rw.store.set_setting(k, v)
        return settings_view()

    @r.get("/api/settings/api-key")
    def reveal_api_key():
        return {"api_key": rw.store.get_setting("api_key", ""), "base_url": f"{rw.config.base_url}/v1"}

    @r.post("/api/settings/api-key/rotate")
    def rotate_api_key():
        rw.store.set_setting("api_key", "rw-" + secrets.token_urlsafe(24))
        return reveal_api_key()

    # ----------------------------------------------------------- providers
    @r.get("/api/providers")
    def providers():
        default = rw.store.get_setting("default_provider", "demo")
        return {"providers": [{**s.public(), "is_default": s.id == default} for s in rw.router.specs()],
                "presets": PRESETS, "types": list(PROVIDER_TYPES)}

    @r.post("/api/providers")
    def save_provider(body: ProviderIn):
        try:
            spec = rw.router.save_spec(dump(body))
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        return spec.public()

    @r.delete("/api/providers/{pid}")
    def delete_provider(pid: str):
        if pid == "demo":
            raise HTTPException(400, "The demo brain can't be removed")
        rw.router.remove_spec(pid)
        return {"ok": True}

    @r.post("/api/providers/{pid}/test")
    async def test_provider(pid: str):
        p = rw.router.get(pid)
        if not p:
            raise HTTPException(404, "No such brain")
        return await p.health()

    # ---------------------------------------------------------------- bots
    @r.get("/api/bots")
    def bots():
        return {"bots": [bot_view(h) for h in rw.helpers.all()], "tools": [t.public() for t in rw.tools.all()]}

    @r.get("/api/helpers")  # v0.1 compatibility
    def helpers():
        return {"helpers": rw.helpers.all(), "tools": [t.public() for t in rw.tools.all()]}

    @r.post("/api/bots")
    def create_bot(body: BotIn):
        try:
            return rw.helpers.create(dump(body))
        except ValueError as exc:
            raise HTTPException(400, str(exc))

    @r.put("/api/bots/{hid}")
    def update_bot(hid: str, body: BotIn):
        if not rw.helpers.exists(hid):
            raise HTTPException(404, "No such Bot")
        try:
            rw.helpers.update(hid, dump(body))
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        return rw.helpers.get(hid)

    @r.delete("/api/bots/{hid}")
    def delete_bot(hid: str):
        rw.helpers.delete(hid)
        return {"ok": True}

    # ------------------------------------------------------------- recipes
    @r.get("/api/recipes")
    def recipes():
        return {"recipes": rw.recipes()}

    @r.post("/api/recipes/{rid}/run")
    async def run_recipe(rid: str, body: RecipeRun):
        recipe = next((x for x in rw.recipes() if x["id"] == rid), None)
        if not recipe:
            raise HTTPException(404, "No such recipe")
        try:
            prompt = render(recipe, body.inputs)
            task = rw.runtime.create_task(prompt, recipe.get("helper", "woo"), recipe_id=rid, thread_id=body.thread_id)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        rw.runtime.start(task["id"])
        return task

    # ------------------------------------------------------------- threads
    @r.get("/api/threads")
    def threads(limit: int = 50):
        return {"threads": rw.threads.list(limit)}

    @r.post("/api/threads")
    async def new_thread(body: MessageIn):
        try:
            task = rw.runtime.create_task(body.message, body.bot_id or "woo")
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        rw.runtime.start(task["id"])
        return {"thread_id": task["thread_id"], "task": task}

    @r.get("/api/threads/{tid}")
    def get_thread(tid: str):
        th = rw.threads.get(tid)
        if not th:
            raise HTTPException(404, "No such conversation")
        turns = rw.threads.turns(tid)[-40:]
        return {"thread": th, "turns": [{**t, "events": rw.bus.history(t["id"])} for t in turns]}

    @r.post("/api/threads/{tid}/messages")
    async def post_message(tid: str, body: MessageIn):
        th = rw.threads.get(tid)
        if not th:
            raise HTTPException(404, "No such conversation")
        try:
            task = rw.runtime.create_task(body.message, body.bot_id or th["bot_id"] or "woo", thread_id=tid)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        rw.runtime.start(task["id"])
        return {"thread_id": tid, "task": task}

    @r.patch("/api/threads/{tid}")
    def rename_thread(tid: str, body: Dict[str, Any]):
        if body.get("title"):
            rw.threads.rename(tid, str(body["title"]))
        if "pinned" in body:
            rw.store.update("threads", tid, {"pinned": int(bool(body["pinned"]))})
        return rw.threads.get(tid)

    @r.delete("/api/threads/{tid}")
    def delete_thread(tid: str):
        for t in rw.threads.turns(tid):
            rw.runtime.cancel(t["id"])
        rw.threads.delete(tid)
        return {"ok": True}

    # --------------------------------------------------------------- tasks
    @r.post("/api/tasks")
    async def create_task(body: TaskIn):
        try:
            task = rw.runtime.create_task(body.prompt, body.helper_id, body.profile, thread_id=body.thread_id)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        rw.runtime.start(task["id"])
        return task

    @r.get("/api/tasks")
    def list_tasks(limit: int = 50):
        return {"tasks": rw.store.query("SELECT id, title, status, helper_id, thread_id, origin, created_at, updated_at, usage "
                                        "FROM tasks ORDER BY created_at DESC LIMIT ?", [limit])}

    @r.get("/api/tasks/{tid}")
    def get_task(tid: str):
        task = rw.store.get("tasks", tid)
        if not task:
            raise HTTPException(404, "No such task")
        return {"task": task, "events": rw.bus.history(tid)}

    @r.post("/api/tasks/{tid}/cancel")
    def cancel_task(tid: str):
        rw.runtime.cancel(tid)
        return {"ok": True}

    @r.delete("/api/tasks/{tid}")
    def delete_task(tid: str):
        rw.runtime.cancel(tid)
        rw.store.execute("DELETE FROM events WHERE task_id = ?", [tid])
        rw.store.delete("tasks", tid)
        return {"ok": True}

    async def pump(request: Request, key: str, first, stop_on_terminal: bool):
        """SSE generator: replay history, then live events. Detects client disconnects within ~1s."""
        q = rw.bus.subscribe(key)
        try:
            last = 0
            for ev in first():
                last = max(last, ev["seq"]) if key != "*" else last
                yield f"data: {json.dumps(ev, default=str)}\n\n"
            idle = 0.0
            while True:
                if await request.is_disconnected():
                    return
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    idle += 1.0
                    if idle >= 15:
                        idle = 0.0
                        yield ": keep-alive\n\n"
                    continue
                idle = 0.0
                if key != "*" and ev["seq"] <= last:
                    continue
                last = ev["seq"] if key != "*" else last
                yield f"data: {json.dumps(ev, default=str)}\n\n"
                if stop_on_terminal and ev["type"] in TERMINAL_EVENTS:
                    yield "event: end\ndata: {}\n\n"
                    return
        finally:
            rw.bus.unsubscribe(key, q)

    @r.get("/api/tasks/{tid}/stream")
    async def task_stream(tid: str, request: Request, after: int = 0):
        task = rw.store.get("tasks", tid)
        if not task:
            raise HTTPException(404, "No such task")
        if task["status"] in ("done", "failed", "stopped", "cancelled", "interrupted"):
            async def replay():
                for ev in rw.bus.history(tid, after):
                    yield f"data: {json.dumps(ev, default=str)}\n\n"
                yield "event: end\ndata: {}\n\n"
            return sse(replay())
        return sse(pump(request, tid, lambda: rw.bus.history(tid, after), True))

    @r.get("/api/stream")
    async def global_stream(request: Request):
        """Every event from every Bot (powers the live board). Deltas are skipped to keep it light."""
        async def gen():
            async for chunk in pump(request, "*", lambda: [], False):
                if '"type": "answer_delta"' in chunk:
                    continue
                yield chunk
        return sse(gen())

    @r.post("/api/approvals/{aid}")
    def decide(aid: str, body: Decision):
        if not rw.runtime.decide(aid, body.approve):
            raise HTTPException(409, "This request was already answered or has expired.")
        return {"ok": True}

    @r.get("/api/approvals")
    def approvals():
        return {"approvals": rw.store.query("""SELECT a.*, t.helper_id, t.thread_id, t.title FROM approvals a
                                               LEFT JOIN tasks t ON t.id = a.task_id WHERE a.status = 'pending' ORDER BY a.created_at""")}

    return r
