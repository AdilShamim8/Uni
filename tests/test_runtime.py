"""Agent runtime: the plan -> act -> observe -> answer loop and its guard-rails."""
from __future__ import annotations

import asyncio

import pytest

from rewoo.harness.runner import auto_approver
from rewoo.models.base import Completion, Message, ModelProvider, ProviderSpec, estimate_tokens


class ScriptedProvider(ModelProvider):
    """A fake 'brain' that plays back a fixed sequence of raw completion texts."""

    def __init__(self, script, pid="demo", local=True):
        super().__init__(ProviderSpec(id=pid, type="demo", model="fake-1", local=local))
        self.script = list(script)
        self.calls = 0

    async def complete(self, messages, system="", model=None, temperature=0.2, max_tokens=1200):
        text = self.script[self.calls] if self.calls < len(self.script) else self.script[-1]
        self.calls += 1
        return Completion(text, self.id, self.spec.model, estimate_tokens(text), estimate_tokens(text), 0.0)


def install_script(rw, script, pid="demo", local=True):
    provider = ScriptedProvider(script, pid=pid, local=local)
    rw.router.register(provider)
    rw.store.set_setting("default_provider", pid)
    return provider


# --------------------------------------------------------------------------- demo end-to-end
def test_demo_end_to_end_search_memory(rw):
    rw.memory.add_document("src_uploads", "Lease", "Monthly rent is 42000 BDT due on the 5th.", external_id="lease1")
    task = asyncio.run(rw.ask("When is my rent due and how much is it?"))
    assert task["status"] == "done"
    tools_used = [e["data"]["tool"] for e in rw.bus.history(task["id"]) if e["type"] == "tool_started"]
    assert "search_memory" in tools_used
    assert "42,000" in task["result"] or "42000" in task["result"]


# --------------------------------------------------------------------------- approvals
def test_approval_flow_approve(rw):
    async def go():
        approver = asyncio.ensure_future(auto_approver(rw, approve=True))
        try:
            # NOTE: must wrap in wait_for (not a bare await), matching
            # rewoo.harness.runner.run_scenario. The demo brain never truly
            # suspends the event loop before emitting "approval_requested", so
            # a bare `await rw.ask(...)` can race ahead of auto_approver's
            # first `bus.subscribe()` call and lose the event forever.
            # wait_for schedules ask() as its own Task and yields at least
            # once, giving the approver task a chance to subscribe first.
            return await asyncio.wait_for(rw.ask("Remember that my sister's birthday is May 3"), timeout=10)
        finally:
            approver.cancel()

    task = asyncio.run(go())
    assert task["status"] == "done"
    events = rw.bus.history(task["id"])
    assert any(e["type"] == "approval_requested" for e in events)
    assert any(e["type"] == "approval_decided" and e["data"]["approved"] for e in events)
    assert any("may 3" in f["text"].lower() for f in rw.memory.facts())


def test_approval_flow_deny(rw):
    async def go():
        approver = asyncio.ensure_future(auto_approver(rw, approve=False))
        try:
            return await asyncio.wait_for(rw.ask("Remember that my favourite colour is teal"), timeout=10)
        finally:
            approver.cancel()

    task = asyncio.run(go())
    assert task["status"] == "done"
    events = rw.bus.history(task["id"])
    assert any(e["type"] == "approval_decided" and not e["data"]["approved"] for e in events)
    assert rw.memory.facts() == []


# --------------------------------------------------------------------------- budget
def test_budget_stop_on_tiny_token_limit(rw):
    rw.store.set_setting("budgets", {"max_steps": 8, "max_tokens": 1, "max_cost_usd": 0.5})
    task = asyncio.run(rw.ask("Tell me something interesting"))
    assert task["status"] == "stopped"


# --------------------------------------------------------------------------- cancel
def test_cancel_before_run_marks_cancelled(rw):
    task = rw.runtime.create_task("Anything at all")
    rw.runtime.cancel(task["id"])
    result = asyncio.run(rw.runtime.run(task["id"]))
    assert result["status"] == "cancelled"


# --------------------------------------------------------------------------- scripted protocol edge cases
def test_unknown_tool_becomes_observation_and_continues(rw):
    script = [
        '{"thought": "trying a bogus tool", "tool": "no_such_tool", "input": {}}',
        '{"thought": "ok, giving a real answer now", "answer": "Final answer after bad tool."}',
    ]
    install_script(rw, script)
    task = asyncio.run(rw.ask("Do something"))
    assert task["status"] == "done"
    assert task["result"] == "Final answer after bad tool."
    tool_errors = [e for e in rw.bus.history(task["id"]) if e["type"] == "tool_error"]
    assert len(tool_errors) == 1
    assert tool_errors[0]["data"]["tool"] == "no_such_tool"


def test_malformed_json_repairs_once_then_treats_raw_text_as_answer(rw):
    script = ["not json at all, first try", "still not json, second try"]
    provider = install_script(rw, script)
    task = asyncio.run(rw.ask("Do something"))
    assert task["status"] == "done"
    assert provider.calls == 2  # one repair attempt, then give up and use raw text
    assert task["result"] == "still not json, second try"


def test_ask_helper_delegation_produces_depth_1_events(rw):
    script = [
        # depth 0: woo delegates to scout
        '{"thought": "let me ask scout", "tool": "ask_helper", "input": {"helper": "scout", "request": "find stuff"}}',
        # depth 1: scout answers directly
        '{"thought": "here is my answer", "answer": "Scout says hello."}',
        # depth 0: woo finishes using the delegated answer
        '{"thought": "done", "answer": "Woo relayed: Scout says hello."}',
    ]
    provider = install_script(rw, script)
    task = asyncio.run(rw.ask("Please delegate this"))
    assert task["status"] == "done"
    assert provider.calls == 3
    events = rw.bus.history(task["id"])
    depth1 = [e for e in events if e["data"].get("depth") == 1]
    assert depth1, "expected at least one depth=1 event from the delegated sub-loop"
    assert any(e["data"].get("agent") == "scout" for e in depth1)
    assert task["result"] == "Woo relayed: Scout says hello."


# --------------------------------------------------------------------------- recovery / episodes
def test_recover_marks_running_tasks_interrupted(rw):
    task = rw.runtime.create_task("Some prompt")
    rw.store.update("tasks", task["id"], {"status": "running"})
    n = rw.runtime.recover()
    assert n == 1
    reloaded = rw.store.get("tasks", task["id"])
    assert reloaded["status"] == "interrupted"
    events = rw.bus.history(task["id"])
    assert any(e["type"] == "interrupted" for e in events)


def test_episode_stored_after_completion(rw):
    before = rw.memory.stats()["episodes"]
    task = asyncio.run(rw.ask("What's today's date?"))
    assert task["status"] == "done"
    after = rw.memory.stats()["episodes"]
    assert after == before + 1
    doc = rw.memory.find_document("src_episodes", task["id"])
    assert doc is not None
