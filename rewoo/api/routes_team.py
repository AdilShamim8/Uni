"""Skills, routines ("teach a task"), channels, engines and Paperclip endpoints."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Request

from ..agent.routines import steps_from_events
from ..agent.skills import render_skill_md
from ..engines.hub import ENGINE_INFO, EngineError
from ..engines.paperclip import PaperclipClient, heartbeat_issue, heartbeat_prompt, verify_secret
from .schemas import CaseIn, ChannelPatch, RoutineIn, RoutinePatch, SkillIn, SkillPatch, TeachIn, TelegramIn, Toggle, dump


CLOSED = ("done", "cancelled")


def build(rw) -> APIRouter:
    r = APIRouter()
    paperclip = PaperclipClient(rw.engines)

    async def report_to_paperclip(task: Dict[str, Any]) -> None:
        """Close the loop: post the Bot's result on the Paperclip issue and set its status."""
        if not task or task.get("origin") != "paperclip" or rw.store.get_setting("paperclip_report", True) is False:
            return
        run = next((e for e in rw.bus.history(task["id"]) if e["type"] == "paperclip_run"), None)
        issue_id = (run or {}).get("data", {}).get("issue_id")
        if not issue_id or not rw.engines.config("paperclip").get("base_url"):
            return
        bot = rw.helpers.get(task["helper_id"])
        try:
            current = await paperclip.issue(issue_id)
            if (current or {}).get("status") in CLOSED:
                rw.bus.emit(task["id"], "paperclip_reported", {"agent": bot["id"], "issue_id": issue_id, "status": "already closed"})
                return
            if task["status"] == "done":
                await paperclip.comment(issue_id, f"**{bot['name']} (ReWoo)** — {task.get('result') or ''}")
                await paperclip.set_status(issue_id, "done")
                outcome = "done"
            else:
                await paperclip.comment(issue_id, f"**{bot['name']} (ReWoo)** couldn't finish: {task.get('error') or task['status']}")
                await paperclip.set_status(issue_id, "blocked")
                outcome = "blocked"
            rw.bus.emit(task["id"], "paperclip_reported", {"agent": bot["id"], "issue_id": issue_id, "status": outcome})
        except EngineError as exc:
            rw.bus.emit(task["id"], "paperclip_reported", {"agent": bot["id"], "issue_id": issue_id, "error": str(exc)[:300]})

    rw.runtime.on_finished.append(report_to_paperclip)

    # -------------------------------------------------------------- skills
    @r.get("/api/skills")
    def skills(status: Optional[str] = None, q: str = "", limit: int = 400):
        rows = rw.skills.all(status)
        if q:
            ql = q.lower()
            rows = [s for s in rows if ql in s["name"] or ql in (s["description"] or "").lower() or ql in (s["category"] or "")]
        counts = {k: len(rw.skills.all(k)) for k in ("proposed", "active", "disabled")}
        return {"skills": rows[:limit], "counts": counts, "hermes_library": bool(rw.hermes_skill_roots())}

    @r.post("/api/skills")
    def create_skill(body: SkillIn):
        if body.status not in ("proposed", "active", "disabled"):
            raise HTTPException(400, "Unknown status")
        return rw.skills.create(body.name, body.description, body.body, status=body.status, source="user", bot_id=body.bot_id)

    @r.patch("/api/skills/{sid}")
    def patch_skill(sid: str, body: SkillPatch):
        if body.status and body.status not in ("proposed", "active", "disabled"):
            raise HTTPException(400, "Unknown status")
        row = rw.skills.update(sid, **{k: v for k, v in dump(body).items() if v is not None})
        if not row:
            raise HTTPException(404, "No such skill")
        return row

    @r.delete("/api/skills/{sid}")
    def delete_skill(sid: str):
        rw.skills.delete(sid)
        return {"ok": True}

    @r.get("/api/skills/{sid}/skill.md")
    def skill_md(sid: str):
        row = rw.skills.get(sid)
        if not row:
            raise HTTPException(404, "No such skill")
        return {"filename": f"{row['name']}/SKILL.md", "content": render_skill_md(row)}

    @r.post("/api/skills/import-hermes")
    def import_hermes():
        roots = rw.hermes_skill_roots()
        if not roots:
            raise HTTPException(404, "The Hermes Agent source isn't in engines/hermes-agent")
        added = sum(rw.skills.import_dir(root, source="hermes", status="disabled") for root in roots)
        return {"imported": added}

    # ------------------------------------------------------------ routines
    @r.get("/api/routines")
    def routines():
        return {"routines": rw.routines.all()}

    @r.post("/api/routines")
    def create_routine(body: RoutineIn):
        if not rw.helpers.exists(body.bot_id):
            raise HTTPException(400, "Unknown Bot")
        try:
            return rw.routines.create(body.bot_id, body.name, body.prompt, body.schedule, body.steps, body.enabled)
        except ValueError as exc:
            raise HTTPException(400, str(exc))

    @r.patch("/api/routines/{rid}")
    def patch_routine(rid: str, body: RoutinePatch):
        try:
            row = rw.routines.update(rid, **dump(body))
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        if not row:
            raise HTTPException(404, "No such routine")
        return row

    @r.delete("/api/routines/{rid}")
    def delete_routine(rid: str):
        rw.routines.delete(rid)
        return {"ok": True}

    @r.post("/api/routines/{rid}/run")
    async def run_routine(rid: str):
        row = rw.routines.get(rid)
        if not row:
            raise HTTPException(404, "No such routine")
        task = rw.start_routine(row)
        rw.routines.mark_ran(rid, task["id"])
        return task

    @r.post("/api/routines/from-task/{tid}")
    def teach(tid: str, body: TeachIn):
        """'Show a Bot how it's done': turn a finished task into a reusable routine."""
        task = rw.store.get("tasks", tid)
        if not task:
            raise HTTPException(404, "No such task")
        if task["status"] != "done":
            raise HTTPException(400, "Only finished tasks can be turned into routines")
        steps = body.steps if body.steps is not None else steps_from_events(rw.bus.history(tid))
        try:
            return rw.routines.create(task["helper_id"], body.name or task["title"], task["prompt"], body.schedule, steps)
        except ValueError as exc:
            raise HTTPException(400, str(exc))

    # ------------------------------------------------------------ channels
    @r.get("/api/channels")
    def channels():
        return {"channels": rw.channels.list()}

    @r.post("/api/channels/telegram")
    async def add_telegram(body: TelegramIn):
        if not rw.helpers.exists(body.default_bot):
            raise HTTPException(400, "Unknown Bot")
        try:
            row = rw.channels.add_telegram(body.name, body.token, body.default_bot)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        try:
            await rw.channels.connector(row["id"]).verify()
            rw.channels.connector(row["id"]).start()
        except Exception as exc:  # noqa: BLE001 - saved, but tell the user
            rw.store.update("channels", row["id"], {"status": "error", "last_error": str(exc)[:300]})
        return rw.channels.public(rw.store.get("channels", row["id"]))

    @r.patch("/api/channels/{cid}")
    def patch_channel(cid: str, body: ChannelPatch):
        try:
            return rw.channels.update(cid, **dump(body))
        except KeyError:
            raise HTTPException(404, "No such channel")

    @r.post("/api/channels/{cid}/enabled")
    async def toggle_channel(cid: str, body: Toggle):
        try:
            await rw.channels.set_enabled(cid, body.enabled)
        except KeyError:
            raise HTTPException(404, "No such channel")
        return rw.channels.public(rw.store.get("channels", cid))

    @r.delete("/api/channels/{cid}")
    async def delete_channel(cid: str):
        await rw.channels.delete(cid)
        return {"ok": True}

    # ------------------------------------------------------------- engines
    @r.get("/api/engines")
    async def engines():
        return {"engines": await rw.engines.all_status(), "snippets": snippets()}

    @r.put("/api/engines/{engine}")
    async def save_engine(engine: str, body: Dict[str, Any]):
        if engine not in ENGINE_INFO or engine == "rewoo":
            raise HTTPException(404, "Unknown engine")
        try:
            rw.engines.save_config(engine, body)
        except EngineError as exc:
            raise HTTPException(400, str(exc))
        return await rw.engines.status(engine)

    def snippets() -> Dict[str, str]:
        base = f"{rw.config.base_url}/v1"
        return {
            "openclaw": (
                '// ~/.openclaw/openclaw.json — use ReWoo (memory + consent) as a model in OpenClaw\n'
                '{\n  "models": {\n    "providers": {\n      "rewoo": {\n'
                f'        "baseUrl": "{base}",\n        "apiKey": "<your ReWoo API key>",\n'
                '        "api": "openai-completions",\n        "models": [{ "id": "woo", "name": "ReWoo Woo" }, { "id": "scout", "name": "ReWoo Scout" }]\n'
                '      }\n    }\n  },\n'
                '  "agents": { "defaults": { "model": { "primary": "rewoo/woo" } } }   // verified with OpenClaw 2026.9\n}'),
            "hermes": (
                "# ~/.hermes/config.yaml — use ReWoo Bots as the model in Hermes Agent (verified)\n"
                "model:\n  default: rewoo/woo\n  provider: rewoo\n"
                "providers:\n  rewoo:\n"
                f"    base_url: \"{base}\"\n    key_env: REWOO_API_KEY      # export REWOO_API_KEY=<your ReWoo API key>\n"
                "# then: hermes chat -q \"Brief me on my lease\" --provider rewoo -m rewoo/scout"),
            "paperclip": (
                "# 1) Paperclip blocks private URLs by default. For a local ReWoo, add this line to\n"
                "#    ~/.paperclip/instances/default/.env (or your instance's .env) and restart Paperclip:\n"
                f"PAPERCLIP_HTTP_ADAPTER_PRIVATE_ENDPOINT_ALLOWLIST={rw.config.base_url}\n\n"
                "# 2) In Paperclip, hire an agent with the built-in \"http\" adapter:\n"
                f"  url: {rw.config.base_url}/api/paperclip/heartbeat\n"
                '  headers: {"X-ReWoo-Secret": "<webhook secret from ReWoo → Settings → Engines>"}\n'
                '  payloadTemplate: {"rewooBot": "scout"}'),
            "curl": (f"curl {base}/chat/completions -H 'Authorization: Bearer <your ReWoo API key>' "
                     "-H 'Content-Type: application/json' -d '{\"model\":\"rewoo/woo\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}'"),
        }

    # ----------------------------------------------------------- paperclip
    @r.post("/api/paperclip/heartbeat", status_code=202)
    async def paperclip_heartbeat(request: Request, x_rewoo_secret: Optional[str] = Header(default=None)):
        """Target URL for Paperclip's built-in `http` adapter (fire-and-forget)."""
        if not verify_secret(rw.engines, x_rewoo_secret):
            raise HTTPException(401, "Missing or wrong X-ReWoo-Secret (set it in ReWoo → Settings → Engines → Paperclip)")
        try:
            payload = await request.json()
        except ValueError:
            raise HTTPException(400, "Expected a JSON body")
        issue = heartbeat_issue(payload)
        if issue.get("id") and rw.engines.config("paperclip").get("base_url"):
            try:  # a closed issue needs no work (Paperclip may wake an agent more than once)
                if ((await paperclip.issue(issue["id"])) or {}).get("status") in CLOSED:
                    return {"accepted": True, "skipped": "issue already closed"}
            except EngineError:
                pass
        bot = str(payload.get("rewooBot") or "woo")
        if not rw.helpers.exists(bot):
            bot = "woo"
        ref = f"paperclip:{payload.get('agentId', '')}"
        existing = rw.store.one("SELECT id FROM threads WHERE origin = 'paperclip' AND external_ref = ?", [ref])
        thread_id = existing["id"] if existing else rw.threads.create(f"Paperclip agent {payload.get('agentId', '')}", bot,
                                                                      origin="paperclip", external_ref=ref)["id"]
        task = rw.runtime.create_task(heartbeat_prompt(payload), bot, thread_id=thread_id, origin="paperclip")
        safe_ctx = {k: v for k, v in (payload.get("context") or {}).items() if k not in ("paperclipRuntimeTools",)} \
            if isinstance(payload.get("context"), dict) else {}
        rw.bus.emit(task["id"], "paperclip_run", {"agent": bot, "run_id": payload.get("runId"), "agent_id": payload.get("agentId"),
                                                  "issue_id": issue.get("id"), "issue": issue.get("identifier") or issue.get("title", "")[:80],
                                                  "wake": issue.get("wake", ""), "context_keys": sorted(safe_ctx)[:60]})
        rw.runtime.start(task["id"])
        return {"accepted": True, "task_id": task["id"], "thread_id": thread_id}

    async def pc(call):
        try:
            return await call
        except EngineError as exc:
            raise HTTPException(400, str(exc))

    @r.get("/api/paperclip/agents")
    async def pc_agents():
        try:
            return {"agents": await paperclip.agents()}
        except EngineError as exc:  # list views degrade gracefully instead of erroring
            return {"agents": [], "error": str(exc)}

    @r.get("/api/paperclip/issues")
    async def pc_issues():
        try:
            return {"issues": await paperclip.issues()}
        except EngineError as exc:
            return {"issues": [], "error": str(exc)}

    @r.post("/api/paperclip/issues")
    async def pc_create_issue(body: CaseIn):
        return await pc(paperclip.create_issue(body.title, body.description, body.assignee_agent_id))

    @r.post("/api/paperclip/agents/{agent_id}/wake")
    async def pc_wake(agent_id: str):
        return await pc(paperclip.wake(agent_id))

    return r
