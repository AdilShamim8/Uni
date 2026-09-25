"""Evaluation harness.

A scenario = setup (documents, facts, settings) + a request + expectations.
Each scenario runs in a fresh, isolated ReWoo against the offline Demo brain by
default, so results are reproducible in CI. Point `brain` at a real provider
to benchmark models on the same scenarios.

Expectation keys:
  status, tools_used, tools_not_used, answer_contains, answer_not_contains,
  cites, max_steps, facts_contains, todos, drafts, receipt_excludes_private,
  secrets_hidden_min, approvals
"""
from __future__ import annotations

import asyncio
import json
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..config import Config
from ..core import ReWoo

DEFAULT_SUITE = Path(__file__).parent / "scenarios"


def auto_approver(rw: ReWoo, approve: bool = True):
    """Answer every approval request automatically (harness / CLI / tests).

    The bus subscription happens *synchronously when this function is called*
    (not when the returned coroutine first runs), so no `approval_requested`
    event can slip past — regardless of Python version or scheduling order.
    Approvals that were already pending are answered too.
    """
    q = rw.bus.subscribe("*")

    async def _run() -> None:
        try:
            for row in rw.store.query("SELECT id FROM approvals WHERE status = 'pending'"):
                rw.runtime.decide(row["id"], approve)
            while True:
                ev = await q.get()
                if ev["type"] == "approval_requested":
                    await asyncio.sleep(0)  # let the runtime register its future first
                    rw.runtime.decide(ev["data"]["id"], approve)
        finally:
            rw.bus.unsubscribe("*", q)

    return _run()


def load_scenarios(path: Optional[str] = None) -> List[Dict[str, Any]]:
    p = Path(path) if path else DEFAULT_SUITE
    files = [p] if p.is_file() else sorted(p.glob("*.json"))
    out: List[Dict[str, Any]] = []
    for f in files:
        data = json.loads(f.read_text(encoding="utf-8"))
        out.extend(data if isinstance(data, list) else [data])
    return out


def _setup(rw: ReWoo, setup: Dict[str, Any]) -> None:
    for k, v in (setup.get("settings") or {}).items():
        rw.store.set_setting(k, v)
    private_src = None
    for d in setup.get("documents", []):
        sid = "src_uploads"
        if d.get("private"):
            if not private_src:
                private_src = rw.memory.add_source("upload", "Private folder", private=True)["id"]
            sid = private_src
        rw.memory.add_document(sid, d["title"], d["text"], external_id=d["title"])
    for f in setup.get("facts", []):
        rw.memory.add_fact(f["text"] if isinstance(f, dict) else f, pinned=isinstance(f, dict) and f.get("pinned", False))


async def run_scenario(sc: Dict[str, Any], brain: Optional[str] = None) -> Dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        rw = ReWoo(Config(data_dir=Path(tmp)), db_path=str(Path(tmp) / "eval.db"), bootstrap_env=brain is not None)
        rw.store.set_setting("demo_typing_delay", 0)
        if brain:
            rw.store.set_setting("default_provider", brain)
        try:
            _setup(rw, sc.get("setup", {}))
            approver = asyncio.ensure_future(auto_approver(rw, sc.get("approve", True)))
            try:
                task = await asyncio.wait_for(rw.ask(sc["prompt"], sc.get("helper", "woo"), sc.get("profile")), timeout=120)
            finally:
                approver.cancel()
            events = rw.bus.history(task["id"])
            return grade(sc, task, events, rw)
        finally:
            rw.close()  # release SQLite file locks before the temp dir is deleted (Windows)


def grade(sc: Dict[str, Any], task: Dict[str, Any], events: List[Dict[str, Any]], rw: ReWoo) -> Dict[str, Any]:
    exp = sc.get("expect", {})
    answer = (task.get("result") or "").lower()
    tools = [e["data"]["tool"] for e in events if e["type"] == "tool_started"]
    receipts = [e["data"] for e in events if e["type"] == "context"]
    failures: List[str] = []

    def check(cond: bool, msg: str):
        if not cond:
            failures.append(msg)

    if "status" in exp:
        check(task["status"] == exp["status"], f"status was {task['status']}, expected {exp['status']}")
    for t in exp.get("tools_used", []):
        check(t in tools, f"expected tool {t} (used: {tools or 'none'})")
    for t in exp.get("tools_not_used", []):
        check(t not in tools, f"tool {t} should not be used")
    for s in exp.get("answer_contains", []):
        check(s.lower() in answer, f"answer missing '{s}'")
    for s in exp.get("answer_not_contains", []):
        check(s.lower() not in answer, f"answer should not contain '{s}'")
    if exp.get("cites"):
        check("[" in answer and "]" in answer, "answer has no citations")
    if "max_steps" in exp:
        steps = (task.get("usage") or {}).get("steps", 0)
        check(steps <= exp["max_steps"], f"took {steps} steps (max {exp['max_steps']})")
    for s in exp.get("facts_contains", []):
        check(any(s.lower() in f["text"].lower() for f in rw.memory.facts()), f"no remembered fact containing '{s}'")
    if "facts_count" in exp:
        check(len(rw.memory.facts()) == exp["facts_count"], f"facts count {len(rw.memory.facts())} != {exp['facts_count']}")
    if "todos" in exp:
        n = len(rw.store.query("SELECT id FROM todos"))
        check(n == exp["todos"], f"{n} to-dos, expected {exp['todos']}")
    if "drafts" in exp:
        n = len(rw.store.query("SELECT id FROM drafts"))
        check(n == exp["drafts"], f"{n} drafts, expected {exp['drafts']}")
    if exp.get("receipt_excludes_private"):
        leaked = [i for r in receipts for i in r.get("used", []) if i.get("private")]
        check(not leaked, "private memory was sent to a remote brain")
        check(any(x.get("reason", "").startswith("From a private source") for r in receipts for x in r.get("left_out", [])),
              "receipt should explain the private item was left out")
    if "secrets_hidden_min" in exp:
        hidden = sum(r.get("secrets_hidden", 0) for r in receipts)
        check(hidden >= exp["secrets_hidden_min"], f"only {hidden} secrets hidden")
    if "approvals" in exp:
        n = len([e for e in events if e["type"] == "approval_requested"])
        check(n == exp["approvals"], f"{n} approval requests, expected {exp['approvals']}")
    return {"id": sc["id"], "name": sc.get("name", sc["id"]), "passed": not failures, "failures": failures,
            "status": task["status"], "tools": tools, "steps": (task.get("usage") or {}).get("steps", 0)}


async def run_suite(path: Optional[str] = None, brain: Optional[str] = None) -> Dict[str, Any]:
    results = [await run_scenario(sc, brain) for sc in load_scenarios(path)]
    passed = sum(r["passed"] for r in results)
    return {"summary": {"total": len(results), "passed": passed, "failed": len(results) - passed}, "results": results}
