"""The agent runtime: plan → act → observe → answer, with guard-rails.

Guard-rails built in (not bolted on):
  • Budgets     — max steps, max tokens and max cost per task; stops politely when hit.
  • Approvals   — risky tools pause the task and ask the human (Allow / Not now).
  • Privacy     — private memory never goes to a remote brain; secrets are redacted.
  • Fallbacks   — if a brain fails, the router tries the next one and says so.
  • Recovery    — malformed model output gets one repair attempt; tool crashes become observations.
  • Durability  — every step is an event in SQLite; tasks interrupted by a restart are marked, not lost.
  • Reflection  — finished tasks become episodic memory, so ReWoo learns your context over time.
"""
from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx

from ..db import Store, new_id, now
from ..events import EventBus
from ..memory.context import ContextBuilder, ContextItem, ContextPack
from ..memory.store import Memory
from ..models.base import Message, ProviderError
from ..models.router import Router
from ..tools.registry import ToolRegistry, ToolResult, needs_approval
from .helpers import Helpers
from .protocol import Action, ProtocolError, cited_numbers, parse_action, system_prompt

DEFAULT_BUDGETS = {"max_steps": 8, "max_tokens": 60000, "max_cost_usd": 0.50}


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


class ToolContext:
    """What a tool is allowed to touch while it runs."""

    def __init__(self, runtime: "AgentRuntime", state: RunState, depth: int):
        self.runtime, self.state, self.depth = runtime, state, depth
        self.store, self.memory = runtime.store, runtime.memory
        self.task_id, self.remote = state.task_id, state.remote
        self.http_transport = runtime.http_transport

    def search(self, query: str) -> ContextPack:
        pack = self.runtime.context.build(
            query, budget_tokens=1500, remote=self.remote, start_n=len(self.state.citations) + 1,
            include_facts=False, exclude_doc_ids={c.doc_id for c in self.state.citations if c.doc_id},
        )
        return pack

    def citation(self, n: int) -> Optional[ContextItem]:
        return next((c for c in self.state.citations if c.n == n), None)

    async def delegate(self, helper_id: str, request: str) -> str:
        helper = self.runtime.helpers.get(helper_id)
        return await self.runtime._loop(self.state, helper, request, depth=self.depth + 1, max_steps=4)


class AgentRuntime:
    def __init__(self, store: Store, bus: EventBus, router: Router, memory: Memory, tools: ToolRegistry,
                 helpers: Helpers, http_transport: Optional[httpx.AsyncBaseTransport] = None):
        self.store, self.bus, self.router, self.memory, self.tools, self.helpers = store, bus, router, memory, tools, helpers
        self.context = ContextBuilder(memory)
        self.http_transport = http_transport
        self._approvals: Dict[str, asyncio.Future] = {}
        self._cancel: set = set()
        self._running: Dict[str, asyncio.Task] = {}

    # ------------------------------------------------------------ lifecycle
    def recover(self) -> int:
        """Tasks that were mid-flight when ReWoo stopped are marked, never silently lost."""
        stale = self.store.query("SELECT id FROM tasks WHERE status IN ('queued','running','waiting')")
        for t in stale:
            self.store.update("tasks", t["id"], {"status": "interrupted", "updated_at": now()})
            self.bus.emit(t["id"], "interrupted", {"message": "ReWoo was restarted while this was running. You can run it again."})
        self.store.execute("UPDATE approvals SET status = 'expired' WHERE status = 'pending'")
        return len(stale)

    def create_task(self, prompt: str, helper_id: str = "woo", profile: Optional[str] = None, recipe_id: Optional[str] = None) -> Dict[str, Any]:
        helper = self.helpers.get(helper_id)
        task = {
            "id": new_id("task_"), "title": prompt.strip().split("\n")[0][:80], "prompt": prompt.strip(),
            "helper_id": helper["id"], "profile": profile or helper.get("profile") or "balanced",
            "status": "queued", "recipe_id": recipe_id, "usage": {}, "updated_at": now(),
        }
        self.store.insert("tasks", task)
        self.bus.emit(task["id"], "queued", {"helper": helper["id"], "title": task["title"]})
        return task

    def start(self, task_id: str) -> asyncio.Task:
        t = asyncio.ensure_future(self.run(task_id))
        self._running[task_id] = t
        t.add_done_callback(lambda _t: self._running.pop(task_id, None))
        return t

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

    # ------------------------------------------------------------------ run
    async def run(self, task_id: str) -> Dict[str, Any]:
        task = self.store.get("tasks", task_id)
        if not task:
            raise KeyError(task_id)
        helper = self.helpers.get(task["helper_id"])
        profile = task.get("profile") or "balanced"
        primary = self.router.primary(profile)
        budgets = {**DEFAULT_BUDGETS, **(self.store.get_setting("budgets", {}) or {})}
        state = RunState(task_id, profile, remote=not primary.is_local, local_only=False, budgets=budgets,
                         approval_mode=self.store.get_setting("approval_mode", "balanced"))
        self._set(task_id, status="running")
        self.bus.emit(task_id, "started", {"helper": helper["id"], "helper_name": helper["name"], "brain": primary.id,
                                           "model": primary.spec.model, "on_device": primary.is_local})
        try:
            answer = await self._loop(state, helper, task["prompt"], depth=0, max_steps=int(budgets["max_steps"]))
            used = [c.as_dict() for c in state.citations if c.n in cited_numbers(answer)]
            self._set(task_id, status="done", result=answer, usage=state.usage)
            self.bus.emit(task_id, "answer", {"text": answer, "citations": used})
            self.memory.add_episode(task_id, task["prompt"], answer)
            self.bus.emit(task_id, "done", {"usage": state.usage, "brains": state.brains})
        except BudgetExceeded as exc:
            msg = f"I stopped to stay within your budget ({exc}). You can raise limits in Settings."
            self._set(task_id, status="stopped", error=msg, usage=state.usage)
            self.bus.emit(task_id, "stopped", {"message": msg, "usage": state.usage})
        except Cancelled:
            self._set(task_id, status="cancelled", usage=state.usage)
            self.bus.emit(task_id, "cancelled", {"message": "Stopped because you asked me to."})
        except ProviderError as exc:
            msg = "I couldn't reach any AI brain. Check Settings → Brains. Details: " + str(exc)[:400]
            self._set(task_id, status="failed", error=msg, usage=state.usage)
            self.bus.emit(task_id, "error", {"message": msg})
        except Exception as exc:  # noqa: BLE001 - never leave a task hanging
            msg = f"Something went wrong: {exc}"
            self._set(task_id, status="failed", error=msg, usage=state.usage)
            self.bus.emit(task_id, "error", {"message": msg})
        finally:
            self._cancel.discard(task_id)
        return self.store.get("tasks", task_id)  # type: ignore[return-value]

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

    async def _loop(self, state: RunState, helper: Dict[str, Any], prompt: str, depth: int, max_steps: int) -> str:
        tid, agent = state.task_id, helper["id"]
        emit = lambda type_, data=None: self.bus.emit(tid, type_, {"agent": agent, "depth": depth, **(data or {})})  # noqa: E731

        # 1) context engineering
        emit("status", {"state": "reading", "text": "Looking through what I know about you…"})
        pack = self.context.build(prompt, budget_tokens=int(self.store.get_setting("context_tokens", 2500)),
                                  remote=state.remote, start_n=len(state.citations) + 1,
                                  exclude_doc_ids={c.doc_id for c in state.citations if c.doc_id})
        state.citations.extend(pack.items)
        state.local_only = state.local_only or pack.contains_private
        emit("context", pack.receipt())

        tools = [t for t in self.tools.subset(helper.get("tools") or None) if not (depth and t.name == "ask_helper")]
        teammates = ", ".join(f"{h['id']} ({h['tagline']})" for h in self.helpers.all() if h["id"] != agent)
        system = system_prompt(helper, tools, self.store.get_setting("user_name", ""), teammates)
        allowed = {t.name for t in tools}
        messages = [Message("user", f"TASK: {prompt}\n\nCONTEXT (cite as [n]):\n{pack.block()}")]
        repaired = False

        for step in range(max_steps + 1):
            self._check(state)
            final_push = step == max_steps
            if final_push:
                messages.append(Message("user", "You are out of steps. Reply now with your best final answer JSON."))
            emit("status", {"state": "thinking", "text": "Thinking…", "step": step + 1})
            completion = await self.router.complete(
                messages, system=system, profile=state.profile, local_only=state.local_only,
                on_switch=lambda a, b, err: emit("brain_switch", {"from": a, "to": b, "reason": err[:200]}),
            )
            u = state.usage
            u["input_tokens"] += completion.input_tokens
            u["output_tokens"] += completion.output_tokens
            u["cost_usd"] = round(u["cost_usd"] + completion.cost_usd, 6)
            u["calls"] += 1
            u["steps"] += 1
            if completion.provider not in state.brains:
                state.brains.append(completion.provider)
            emit("usage", {**u, "brain": completion.provider, "model": completion.model})
            self._check(state)

            try:
                action = parse_action(completion.text)
            except ProtocolError:
                if not repaired and not final_push:
                    repaired = True
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
            if final_push:
                return "I ran out of steps before finishing. Here's where I got to: " + (action.thought or "no conclusion yet.")

            observation = await self._use_tool(state, action, allowed, depth, emit)
            messages += [Message("assistant", action.normalized()), Message("user", f"OBSERVATION ({action.tool}):\n{observation}")]
        return "I couldn't finish this one."

    async def _use_tool(self, state: RunState, action: Action, allowed: set, depth: int, emit) -> str:
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
            fut: asyncio.Future = asyncio.get_event_loop().create_future()
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
        try:
            ctx = ToolContext(self, state, depth)
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
