"""Threads: conversations with one or more Bots.

A thread is an ordered list of tasks (one user message → one Bot answer).
Follow-up messages get the recent turns as conversation context, so you can
say "make it shorter" and the Bot knows what "it" is. Several Bots can work in
the same thread (hand-offs), exactly like messaging a team.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..db import Store, new_id, now


class Threads:
    def __init__(self, store: Store):
        self.store = store

    def create(self, title: str, bot_id: str, origin: str = "app", external_ref: Optional[str] = None) -> Dict[str, Any]:
        row = {"id": new_id("th_"), "title": (title.strip().split("\n")[0] or "New chat")[:80], "bot_id": bot_id,
               "origin": origin, "external_ref": external_ref, "pinned": 0, "updated_at": now()}
        return self.store.insert("threads", row)

    def get(self, tid: str) -> Optional[Dict[str, Any]]:
        return self.store.get("threads", tid)

    def touch(self, tid: str) -> None:
        self.store.update("threads", tid, {"updated_at": now()})

    def list(self, limit: int = 50, origin: Optional[str] = None) -> List[Dict[str, Any]]:
        sql = """SELECT t.*, (SELECT COUNT(*) FROM tasks k WHERE k.thread_id = t.id) AS turns,
                        (SELECT status FROM tasks k WHERE k.thread_id = t.id ORDER BY k.created_at DESC LIMIT 1) AS last_status
                 FROM threads t"""
        params: List[Any] = []
        if origin:
            sql += " WHERE t.origin = ?"
            params.append(origin)
        sql += " ORDER BY t.pinned DESC, t.updated_at DESC LIMIT ?"
        return self.store.query(sql, [*params, limit])

    def turns(self, tid: str) -> List[Dict[str, Any]]:
        return self.store.query(
            "SELECT id, prompt, result, error, status, helper_id, created_at, usage FROM tasks WHERE thread_id = ? ORDER BY created_at",
            [tid])

    def history_block(self, tid: Optional[str], before_task: str, bot_names: Dict[str, str], limit: int = 6,
                      max_chars: int = 3000) -> str:
        """Recent finished turns as plain text for the prompt (newest last, size-capped)."""
        if not tid:
            return ""
        rows = [t for t in self.turns(tid) if t["id"] != before_task and t["status"] == "done" and t["result"]]
        lines: List[str] = []
        for t in rows[-limit:]:
            who = bot_names.get(t["helper_id"], t["helper_id"])
            lines.append(f"You: {t['prompt'][:600]}\n{who}: {t['result'][:900]}")
        text = "\n\n".join(lines)
        return text[-max_chars:]

    def rename(self, tid: str, title: str) -> None:
        self.store.update("threads", tid, {"title": title[:80]})

    def delete(self, tid: str) -> None:
        for t in self.store.query("SELECT id FROM tasks WHERE thread_id = ?", [tid]):
            self.store.execute("DELETE FROM events WHERE task_id = ?", [t["id"]])
            self.store.delete("tasks", t["id"])
        self.store.delete("threads", tid)
