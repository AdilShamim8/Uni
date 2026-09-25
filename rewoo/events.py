"""Event log + live event bus.

Every meaningful thing an agent does becomes an event: it is persisted (so any
task can be replayed later) and pushed to live subscribers (the UI, via SSE).
This is ReWoo's answer to "what is my agent doing right now?".
"""
from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List, Optional

from .db import Store, now


class EventBus:
    def __init__(self, store: Store):
        self.store = store
        self._subs: Dict[str, List[asyncio.Queue]] = {}
        self._seq: Dict[str, int] = {}

    def _next_seq(self, task_id: str) -> int:
        if task_id not in self._seq:
            row = self.store.one("SELECT MAX(seq) AS m FROM events WHERE task_id = ?", [task_id])
            self._seq[task_id] = (row["m"] or 0) if row else 0
        self._seq[task_id] += 1
        return self._seq[task_id]

    def emit(self, task_id: str, type_: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        event = {
            "task_id": task_id,
            "seq": self._next_seq(task_id),
            "type": type_,
            "data": data or {},
            "created_at": now(),
        }
        self.store.execute(
            "INSERT INTO events (task_id, seq, type, data, created_at) VALUES (?, ?, ?, ?, ?)",
            [task_id, event["seq"], type_, json.dumps(event["data"], default=str), event["created_at"]],
        )
        for key in (task_id, "*"):
            for q in list(self._subs.get(key, [])):
                try:
                    q.put_nowait(event)
                except asyncio.QueueFull:  # slow consumer: drop, it can re-sync from the log
                    pass
        return event

    def history(self, task_id: str, after_seq: int = 0) -> List[Dict[str, Any]]:
        return self.store.query(
            "SELECT task_id, seq, type, data, created_at FROM events WHERE task_id = ? AND seq > ? ORDER BY seq",
            [task_id, after_seq],
        )

    def subscribe(self, task_id: str = "*") -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=1000)
        self._subs.setdefault(task_id, []).append(q)
        return q

    def unsubscribe(self, task_id: str, q: asyncio.Queue) -> None:
        subs = self._subs.get(task_id, [])
        if q in subs:
            subs.remove(q)
