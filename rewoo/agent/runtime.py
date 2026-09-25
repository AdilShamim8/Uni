"""The agent runtime: plan → act → observe → answer, with guard-rails.

Guard-rails built in (not bolted on):
  • Budgets     — max steps, max tokens and max cost per task; stops politely when hit.
  • Approvals   — risky tools pause the task and ask the human (Allow / Not now).
  • Privacy     — private memory never goes to a remote brain; secrets are redacted.
  • Fallbacks   — if a brain fails, the router tries the next one and says so.
  • Recovery    — malformed model output gets one repair attempt; tool crashes become observations.
  • Durability  — every step is an event in SQLite; tasks interrupted by a restart are marked, not lost.
  • Streaming   — the final answer streams word-by-word (`answer_delta` events).
  • Threads     — follow-ups see the recent conversation.
  • Learning    — finished tasks become episodic memory, and non-trivial runs propose a
                  reusable Skill (Hermes-style) that you can approve.
  • Engines     — a Bot can be powered by Hermes Agent or OpenClaw instead of the built-in loop.
"""
from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

import httpx

from ..db import Store, new_id, now
from ..events import EventBus
from ..memory.context import ContextBuilder, ContextItem, ContextPack
from ..memory.store import Memory
from ..models.base import Message, ProviderError
from ..models.router import Router
from ..tools.registry import ToolRegistry, ToolResult, needs_approval
from .helpers import Helpers
from .protocol import Action, AnswerStream, ProtocolError, cited_numbers, parse_action, system_prompt
from .skills import SKILL_WRITER_PROMPT, Skills, draft_skill_from_run
from .threads import Threads

DEFAULT_BUDGETS = {"max_steps": 8, "max_tokens": 60000, "max_cost_usd": 0.50}
TERMINAL_STATUSES = ("done", "failed", "stopped", "cancelled", "interrupted")


class BudgetExceeded(Exception):
    pass


class Cancelled(Exception):
    pass


@dataclass
class RunState:
    task_id: str
    profile: str
    remote: bool
    local_only: bool
    budgets: Dict[str, Any]
    approval_mode: str
    citations: List[ContextItem] = field(default_factory=list)
    usage: Dict[str, Any] = field(default_factory=lambda: {"input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "steps": 0, "calls": 0})
    brains: List[str] = field(default_factory=list)
    tool_steps: List[Dict[str, Any]] = field(default_factory=list)
    skills_used: List[str] = field(default_factory=list)


class ToolContext:
    """What a tool is allowed to touch while it runs."""

    def __init__(self, runtime: "AgentRuntime", state: RunState, depth: int, bot_id: str = ""):
        self.runtime, self.state, self.depth, self.bot_id = runtime, state, depth, bot_id
        self.store, self.memory = runtime.store, runtime.memory
        self.task_id, self.remote = state.task_id, state.remote
        self.http_transport = runtime.http_transport

    def search(self, query: str) -> ContextPack:
        return self.runtime.context.build(
            query, budget_tokens=1500, remote=self.remote, start_n=len(self.state.citations) + 1,
            include_facts=False, exclude_doc_ids={c.doc_id for c in self.state.citations if c.doc_id},
        )

    def citation(self, n: int) -> Optional[ContextItem]:
        return next((c for c in self.state.citations if c.n == n), None)

    async def delegate(self, helper_id: str, request: str) -> str:
        if not self.runtime.helpers.exists(helper_id):
            return f"There is no teammate called '{helper_id}'."
        helper = self.runtime.helpers.get(helper_id)
        self.runtime.bus.emit(self.task_id, "handoff", {"agent": self.bot_id, "to": helper["id"], "to_name": helper["name"],
                                                        "request": request[:300], "depth": self.depth})
        return await self.runtime._loop(self.state, helper, request, depth=self.depth + 1, max_steps=4)


class AgentRuntime:
    def __init__(self, store: Store, bus: EventBus, router: Router, memory: Memory, tools: ToolRegistry,
                 helpers: Helpers, http_transport: Optional[httpx.AsyncBaseTransport] = None,
                 skills: Optional[Skills] = None, threads: Optional[Threads] = None, engines: Any = None):
        self.store, self.bus, self.router, self.memory, self.tools, self.helpers = store, bus, router, memory, tools, helpers
        self.skills = skills or Skills(store)
        self.threads = threads or Threads(store)
        self.engines = engines
        self.context = ContextBuilder(memory)
        self.http_transport = http_transport
        self._approvals: Dict[str, asyncio.Future] = {}
        self._cancel: set = set()
        self._running: Dict[str, asyncio.Task] = {}
        self.on_finished: List[Callable[[Dict[str, Any]], Any]] = []  # hooks (channels, API waiters)

    # ------------------------------------------------------------ lifecycle
    def recover(self) -> int:
        """Tasks that were mid-flight when ReWoo stopped are marked, never silently lost."""
        stale = self.store.query("SELECT id FROM tasks WHERE status IN ('queued','running','waiting')")
        for t in stale:
            self.store.update("tasks", t["id"], {"status": "interrupted", "updated_at": now()})
            self.bus.emit(t["id"], "interrupted", {"message": "ReWoo was restarted while this was running. You can run it again."})
        self.store.execute("UPDATE approvals SET status = 'expired' WHERE status = 'pending'")
        return len(stale)

    def create_task(self, prompt: str, helper_id: str = "woo", profile: Optional[str] = None, recipe_id: Optional[str] = None,
                    thread_id: Optional[str] = None, origin: str = "app", routine_id: Optional[str] = None) -> Dict[str, Any]:
        prompt = (prompt or "").strip()
        if not prompt:
            raise ValueError("Tell me what you need first")
        helper = self.helpers.get(helper_id)
        if thread_id and not self.threads.get(thread_id):
            raise ValueError("That conversation no longer exists")
        if not thread_id:
            thread_id = self.threads.create(prompt, helper["id"], origin=origin)["id"]
        else:
            self.threads.touch(thread_id)
        task = {
            "id": new_id("task_"), "title": prompt.split("\n")[0][:80], "prompt": prompt,
            "helper_id": helper["id"], "profile": profile or helper.get("profile") or "balanced",
            "status": "queued", "recipe_id": recipe_id, "usage": {}, "updated_at": now(),
            "thread_id": thread_id, "origin": origin, "routine_id": routine_id,
        }
        self.store.insert("tasks", task)
        self.bus.emit(task["id"], "queued", {"helper": helper["id"], "agent": helper["id"], "title": task["title"],
                                             "thread_id": thread_id})
        return task

    def start(self, task_id: str) -> asyncio.Task:
        t = asyncio.ensure_future(self.run(task_id))
        self._running[task_id] = t
        t.add_done_callback(lambda _t: self._running.pop(task_id, None))
        return t

    def running(self) -> List[str]:
        return list(self._running)

    def cancel(self, task_id: str) -> None:
        self._cancel.add(task_id)
        for aid, fut in list(self._approvals.items()):
            row = self.store.get("approvals", aid)
            if row and row["task_id"] == task_id and not fut.done():
                fut.set_result(False)

    def decide(self, approval_id: str, approve: bool) -> bool:
        row = self.store.get("approvals", approval_id)
        if not row or row["status"] != "pending":
            return False
        self.store.update("approvals", approval_id, {"status": "approved" if approve else "denied", "decided_at": now()})
        fut = self._approvals.get(approval_id)
        if fut and not fut.done():
            fut.set_result(approve)
        return True

    async def wait(self, task_id: str, timeout: float = 600) -> Dict[str, Any]:
        """Wait until a task reaches a terminal status (used by API/channels)."""
        q = self.bus.subscribe(task_id)
        try:
            task = self.store.get("tasks", task_id)
            deadline = asyncio.get_running_loop().time() + timeout
            while task and task["status"] not in TERMINAL_STATUSES:
                remaining = deadline - asyncio.get_running_loop().time()
                if remaining <= 0:
                    break
                try:
                    await asyncio.wait_for(q.get(), timeout=min(remaining, 5))
                except asyncio.TimeoutError:
                    pass
                task = self.store.get("tasks", task_id)
            return task  # type: ignore[return-value]
        finally:
            self.bus.unsubscribe(task_id, q)

    # ------------------------------------------------------------------ run
    async def run(self, task_id: str) -> Dict[str, Any]:
        task = self.store.get("tasks", task_id)
        if not task:
            raise KeyError(task_id)
        helper = self.helpers.get(task["helper_id"])
        profile = task.get("profile") or "balanced"
        engine = helper.get("engine") or "rewoo"
        primary = self.router.primary(profile)
        budgets = {**DEFAULT_BUDGETS, **(self.store.get_setting("budgets", {}) or {})}
        # External engines are treated as remote unless explicitly marked local.
        remote = (not primary.is_local) if engine == "rewoo" else not bool((helper.get("engine_config") or {}).get("local"))
        state = RunState(task_id, profile, remote=remote, local_only=False, budgets=budgets,
                         approval_mode=self.store.get_setting("approval_mode", "balanced"))
        self._set(task_id, status="running")
        brain = primary.id if engine == "rewoo" else f"engine:{engine}"
        self.bus.emit(task_id, "started", {"helper": helper["id"], "agent": helper["id"], "helper_name": helper["name"],
                                           "brain": brain, "model": primary.spec.model if engine == "rewoo" else engine,
                                           "on_device": not remote, "engine": engine, "thread_id": task.get("thread_id")})
        names = {h["id"]: h["name"] for h in self.helpers.all()}
        history = self.threads.history_block(task.get("thread_id"), task_id, names)
        try:
            if engine == "rewoo":
                answer = await self._loop(state, helper, task["prompt"], depth=0, max_steps=int(budgets["max_steps"]), history=history)
            else:
                answer = await self._run_engine(state, helper, engine, task["prompt"], history)
            used = [c.as_dict() for c in state.citations if c.n in cited_numbers(answer)]
            self._set(task_id, status="done", result=answer, usage=state.usage)
            self.bus.emit(task_id, "answer", {"text": answer, "citations": used, "agent": helper["id"]})
            self.memory.add_episode(task_id, task["prompt"], answer)
            await self._maybe_propose_skill(state, helper, task, answer)
            self.bus.emit(task_id, "done", {"usage": state.usage, "brains": state.brains, "agent": helper["id"]})
        except BudgetExceeded as exc:
            msg = f"I stopped to stay within your budget ({exc}). You can raise limits in Settings."
            self._set(task_id, status="stopped", error=msg, usage=state.usage)
            self.bus.emit(task_id, "stopped", {"message": msg, "usage": state.usage, "agent": helper["id"]})
        except Cancelled:
            self._set(task_id, status="cancelled", usage=state.usage)
            self.bus.emit(task_id, "cancelled", {"message": "Stopped because you asked me to.", "agent": helper["id"]})
        except ProviderError as exc:
            msg = "I couldn't reach any AI brain. Check Settings → Brains. Details: " + str(exc)[:400]
            self._set(task_id, status="failed", error=msg, usage=state.usage)
            self.bus.emit(task_id, "error", {"message": msg, "agent": helper["id"]})
        except Exception as exc:  # noqa: BLE001 - never leave a task hanging
            msg = f"Something went wrong: {exc}"
            self._set(task_id, status="failed", error=msg, usage=state.usage)
            self.bus.emit(task_id, "error", {"message": msg, "agent": helper["id"]})
        finally:
            self._cancel.discard(task_id)
        final = self.store.get("tasks", task_id)
        for hook in list(self.on_finished):
            try:
                res = hook(final)
                if asyncio.iscoroutine(res):
                    await res
            except Exception:  # noqa: BLE001 - hooks must never break the runtime
                pass
        return final  # type: ignore[return-value]

    def _set(self, task_id: str, **changes: Any) -> None:
        changes["updated_at"] = now()
        self.store.update("tasks", task_id, changes)

    def _check(self, state: RunState) -> None:
        if state.task_id in self._cancel:
            raise Cancelled()
        u, b = state.usage, state.budgets
        if u["input_tokens"] + u["output_tokens"] > b["max_tokens"]:
            raise BudgetExceeded(f"token limit {b['max_tokens']:,}")
        if u["cost_usd"] > b["max_cost_usd"]:
            raise BudgetExceeded(f"cost limit ${b['max_cost_usd']:.2f}")

    def _account(self, state: RunState, completion, emit) -> None:
        u = state.usage
        u["input_tokens"] += completion.input_tokens
        u["output_tokens"] += completion.output_tokens
        u["cost_usd"] = round(u["cost_usd"] + completion.cost_usd, 6)
        u["calls"] += 1
        u["steps"] += 1
        if completion.provider not in state.brains:
            state.brains.append(completion.provider)
        emit("usage", {**u, "brain": completion.provider, "model": completion.model})

    # ------------------------------------------------------- built-in loop
    async def _loop(self, state: RunState, helper: Dict[str, Any], prompt: str, depth: int, max_steps: int,
                    history: str = "") -> str:
        tid, agent = state.task_id, helper["id"]
        emit = lambda type_, data=None: self.bus.emit(tid, type_, {"agent": agent, "depth": depth, **(data or {})})  # noqa: E731

        # 1) context engineering
        emit("status", {"state": "reading", "text": "Looking through what I know about you…"})
        pack = self.context.build(prompt, budget_tokens=int(self.store.get_setting("context_tokens", 2500)),
                                  remote=state.remote, start_n=len(state.citations) + 1,
                                  exclude_doc_ids={c.doc_id for c in state.citations if c.doc_id}, bot_id=agent)
        state.citations.extend(pack.items)
        state.local_only = state.local_only or pack.contains_private
        emit("context", pack.receipt())

        # 2) skills this Bot has learned that fit the request
        skills = self.skills.relevant(prompt, bot_id=agent)
        if skills:
            for s in skills:
                self.skills.mark_used(s["id"])
                if s["id"] not in state.skills_used:
                    state.skills_used.append(s["id"])
            emit("skills_used", {"skills": [{"id": s["id"], "name": s["name"], "description": s["description"]} for s in skills]})

        tools = [t for t in self.tools.subset(helper.get("tools") or None) if not (depth and t.name == "ask_helper")]
        teammates = ", ".join(f"{h['id']} ({h['tagline']})" for h in self.helpers.all() if h["id"] != agent)
        system = system_prompt(helper, tools, self.store.get_setting("user_name", ""), teammates) + Skills.prompt_block(skills)
        allowed = {t.name for t in tools}
        convo = f"\n\nCONVERSATION SO FAR (most recent last):\n{history}" if history else ""
        messages = [Message("user", f"TASK: {prompt}\n\nCONTEXT (cite as [n]):\n{pack.block()}{convo}")]
        repaired = False

        for step in range(max_steps + 1):
            self._check(state)
            final_push = step == max_steps
            if final_push:
                messages.append(Message("user", "You are out of steps. Reply now with your best final answer JSON."))
            emit("status", {"state": "thinking", "text": "Thinking…", "step": step + 1})
            extractor = AnswerStream()
            streamed = {"any": False}

            def on_delta(delta: str) -> None:
                if depth:
                    return
                piece = extractor.feed(delta)
                if piece:
                    if not streamed["any"]:
                        emit("status", {"state": "writing", "text": "Writing the answer…"})
                    streamed["any"] = True
                    emit("answer_delta", {"text": piece})

            completion = await self.router.stream(
                messages, on_delta, system=system, profile=state.profile, local_only=state.local_only,
                on_switch=lambda a, b, err: emit("brain_switch", {"from": a, "to": b, "reason": err[:200]}),
            )
            self._account(state, completion, emit)
            self._check(state)

            try:
                action = parse_action(completion.text)
            except ProtocolError:
                if not repaired and not final_push and not extractor.plain:
                    repaired = True
                    if streamed["any"]:
                        emit("answer_reset", {})
                    messages += [Message("assistant", completion.text[:2000]),
                                 Message("user", "Please reply with ONE valid JSON object exactly as described.")]
                    emit("status", {"state": "thinking", "text": "Tidying up my thoughts…"})
                    continue
                action = Action(thought="", answer=completion.text.strip() or "I couldn't produce an answer.")

            if action.plan and step == 0:
                emit("plan", {"steps": action.plan})
            if action.thought:
                emit("thought", {"text": action.thought})
            if action.answer is not None:
                return action.answer
            if streamed["any"]:
                emit("answer_reset", {})
            if final_push:
                return "I ran out of steps before finishing. Here's where I got to: " + (action.thought or "no conclusion yet.")

            observation = await self._use_tool(state, action, allowed, depth, emit, agent)
            messages += [Message("assistant", action.normalized()), Message("user", f"OBSERVATION ({action.tool}):\n{observation}")]
        return "I couldn't finish this one."

    async def _use_tool(self, state: RunState, action: Action, allowed: set, depth: int, emit, agent: str = "") -> str:
        tool = self.tools.get(action.tool)
        if not tool or action.tool not in allowed:
            emit("tool_error", {"tool": action.tool, "text": "I tried a tool I don't have."})
            return f"Tool '{action.tool}' is not available. Available: {', '.join(sorted(allowed))}"

        if needs_approval(tool, state.approval_mode):
            aid = new_id("appr_")
            reason = {"memory": "This changes what I remember about you.", "external": "This goes out to the internet.",
                      "irreversible": "This can't be undone."}.get(tool.risk, "")
            self.store.insert("approvals", {"id": aid, "task_id": state.task_id, "tool": tool.name, "input": action.input,
                                            "reason": reason, "status": "pending"})
            fut: asyncio.Future = asyncio.get_running_loop().create_future()
            self._approvals[aid] = fut
            self._set(state.task_id, status="waiting")
            emit("status", {"state": "waiting", "text": "Waiting for your OK…"})
            emit("approval_requested", {"id": aid, "tool": tool.name, "label": tool.label, "emoji": tool.emoji,
                                        "input": action.input, "reason": reason, "thought": action.thought})
            try:
                approved = await fut
            finally:
                self._approvals.pop(aid, None)
            self._set(state.task_id, status="running")
            emit("approval_decided", {"id": aid, "approved": approved, "tool": tool.name})
            if state.task_id in self._cancel:
                raise Cancelled()
            if not approved:
                return f"{tool.name}: the user DENIED this action. Do not retry it; continue without it."

        emit("status", {"state": "working", "text": tool.label or tool.name, "tool": tool.name})
        emit("tool_started", {"tool": tool.name, "label": tool.label, "emoji": tool.emoji, "input": action.input})
        if not depth:
            state.tool_steps.append({"tool": tool.name, "label": tool.label, "input": action.input})
        try:
            ctx = ToolContext(self, state, depth, agent)
            result: ToolResult = await asyncio.wait_for(tool.fn(ctx, **action.input), timeout=90)
        except asyncio.TimeoutError:
            result = ToolResult(f"{tool.name} took too long and was stopped.", ok=False)
        except (Cancelled, BudgetExceeded):
            raise
        except TypeError as exc:
            result = ToolResult(f"{tool.name} got the wrong inputs: {exc}", ok=False)
        except Exception as exc:  # noqa: BLE001
            result = ToolResult(f"{tool.name} failed: {exc}", ok=False)
        if result.context_items:
            state.citations.extend(result.context_items)
            emit("context_update", {"added": [c.as_dict() for c in result.context_items]})
        emit("tool_finished", {"tool": tool.name, "label": tool.label, "emoji": tool.emoji, "ok": result.ok,
                               "data": json.loads(json.dumps(result.data, default=str))})
        return result.text[:6000]

    # ------------------------------------------------------------- engines
    async def _run_engine(self, state: RunState, helper: Dict[str, Any], engine: str, prompt: str, history: str) -> str:
        tid, agent = state.task_id, helper["id"]
        emit = lambda type_, data=None: self.bus.emit(tid, type_, {"agent": agent, "depth": 0, **(data or {})})  # noqa: E731
        if self.engines is None:
            raise ProviderError(f"Engine '{engine}' is not available in this build", retryable=False)
        emit("status", {"state": "reading", "text": "Picking what's relevant from your memory…"})
        pack = self.context.build(prompt, budget_tokens=int(self.store.get_setting("context_tokens", 2500)),
                                  remote=state.remote, bot_id=agent)
        state.citations.extend(pack.items)
        emit("context", pack.receipt())
        name = {"hermes": "Hermes Agent", "openclaw": "OpenClaw"}.get(engine, engine)
        emit("status", {"state": "working", "text": f"Working in {name}…", "tool": f"engine:{engine}"})
        emit("tool_started", {"tool": f"engine:{engine}", "label": f"Running on {name}", "emoji": "🧩", "input": {"request": prompt[:200]}})
        started = {"any": False}

        def on_delta(delta: str) -> None:
            if not started["any"]:
                emit("status", {"state": "writing", "text": "Writing the answer…"})
            started["any"] = True
            emit("answer_delta", {"text": delta})

        try:
            completion = await self.engines.run(engine, helper, prompt, history, pack.block(), on_delta)
        except Exception as exc:  # EngineError and friends
            emit("tool_finished", {"tool": f"engine:{engine}", "label": f"Running on {name}", "emoji": "🧩", "ok": False,
                                   "data": {"error": str(exc)[:300]}})
            raise ProviderError(str(exc), retryable=False)
        self._account(state, completion, emit)
        emit("tool_finished", {"tool": f"engine:{engine}", "label": f"Running on {name}", "emoji": "🧩", "ok": True,
                               "data": {"result": "answered"}})
        return completion.text.strip() or f"{name} returned an empty answer."

    # -------------------------------------------------------------- skills
    async def _maybe_propose_skill(self, state: RunState, helper: Dict[str, Any], task: Dict[str, Any], answer: str) -> None:
        """Hermes-style learning loop, with consent: propose — never auto-install — a skill."""
        if self.store.get_setting("learning", "ask") == "off":
            return
        distinct = {s["tool"] for s in state.tool_steps}
        if len(distinct) < 2 or state.skills_used:
            return
        draft = None
        primary = self.router.primary(state.profile)
        if primary.spec.type != "demo":
            try:
                steps = "; ".join(f"{s['label'] or s['tool']} {json.dumps(s['input'])[:80]}" for s in state.tool_steps)
                out = await self.router.complete([Message("user", SKILL_WRITER_PROMPT.format(
                    prompt=task["prompt"][:800], steps=steps[:1500], answer=answer[:800]))],
                    system="You write concise, reusable agent skills. Reply with JSON only.",
                    profile=state.profile, local_only=state.local_only, max_tokens=900)
                obj = json.loads(out.text[out.text.find("{"): out.text.rfind("}") + 1])
                if obj.get("name") and obj.get("description") and obj.get("body"):
                    draft = {"name": str(obj["name"]), "description": str(obj["description"]), "body": str(obj["body"])}
            except Exception:  # noqa: BLE001 - fall back to the deterministic draft
                draft = None
        draft = draft or draft_skill_from_run(task["prompt"], answer, state.tool_steps, helper["name"])
        skill = self.skills.create(draft["name"], draft["description"], draft["body"], status="proposed",
                                   source="learned", bot_id=helper["id"], origin_task=task["id"])
        self.bus.emit(task["id"], "skill_proposed", {"agent": helper["id"], "skill": {
            "id": skill["id"], "name": skill["name"], "description": skill["description"]}})
