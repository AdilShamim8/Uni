"""Trace replay: turn a task's event log back into a readable story."""
from __future__ import annotations

import datetime as dt
from typing import Any, Dict, List

ICONS = {
    "queued": "📥", "started": "🚀", "status": "·", "context": "🧠", "plan": "🗺️", "thought": "💭",
    "tool_started": "🔧", "tool_finished": "✔️", "tool_error": "⚠️", "approval_requested": "✋",
    "approval_decided": "👍", "context_update": "➕", "brain_switch": "🔀", "usage": "📊",
    "answer": "💬", "done": "🏁", "error": "❌", "stopped": "⏸️", "cancelled": "🛑", "interrupted": "⚡",
}


def describe(ev: Dict[str, Any]) -> str:
    d, t = ev["data"], ev["type"]
    if t == "context":
        return f"used {len(d.get('used', []))} memory items, left out {len(d.get('left_out', []))}, hid {d.get('secrets_hidden', 0)} secrets"
    if t == "plan":
        return " → ".join(d.get("steps", []))
    if t in ("thought", "status"):
        return d.get("text", "")
    if t == "tool_started":
        return f"{d.get('label') or d.get('tool')} {d.get('input')}"
    if t == "tool_finished":
        return f"{d.get('tool')} {'ok' if d.get('ok') else 'failed'}"
    if t == "approval_requested":
        return f"asked permission for {d.get('tool')}: {d.get('input')}"
    if t == "approval_decided":
        return "approved" if d.get("approved") else "denied"
    if t == "usage":
        return f"{d.get('brain')} · {d.get('input_tokens', 0) + d.get('output_tokens', 0)} tokens · ${d.get('cost_usd', 0):.4f}"
    if t == "answer":
        return d.get("text", "")[:300].replace("\n", " ")
    return str(d.get("message") or d.get("helper") or "")


def trace_lines(events: List[Dict[str, Any]]) -> List[str]:
    lines = []
    for ev in events:
        when = dt.datetime.fromtimestamp(ev["created_at"]).strftime("%H:%M:%S")
        indent = "    " * int(ev["data"].get("depth", 0) or 0)
        agent = ev["data"].get("agent", "")
        lines.append(f"{when} {indent}{ICONS.get(ev['type'], '•')} {ev['type']:<18} {('['+agent+'] ') if agent else ''}{describe(ev)}")
    return lines


def print_trace(rw, task_id: str) -> int:
    import sys
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001
            pass
    task = rw.store.get("tasks", task_id)
    if not task:
        print(f"No task {task_id}")
        return 1
    print(f"Task {task_id}: {task['prompt']}\nStatus: {task['status']}\n")
    for line in trace_lines(rw.bus.history(task_id)):
        print(line)
    return 0
