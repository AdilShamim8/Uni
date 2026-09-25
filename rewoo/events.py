"""Event log + live event bus.

Every meaningful thing a Bot does becomes an event: it is persisted (so any
task can be replayed later) and pushed to live subscribers (the UI via SSE,
channels like Telegram, the OpenAI-compatible endpoint...).

Thread-safety: sequence numbers are allocated and persisted under one lock, and
fan-out to asyncio queues always happens on the owning event loop
(`call_soon_threadsafe` when `emit` is called from a worker thread).

The bus also keeps a tiny in-memory "activity board": what each Bot is doing
right now. That powers the live Bots grid without replaying event logs.
"""
from __future__ import annotations

import asyncio
import json
import threading
from typing import Any, Dict, List, Optional, Tuple

from .db import Store, now


class EventBus:
    def __init__(self, store: Store):
        self.store = store
        self._subs: Dict[str, List[Tuple[asyncio.Queue, asyncio.AbstractEventLoop]]] = {}
        self._seq: Dict[str, int] = {}
        self._lock = threading.Lock()
        self.activity: Dict[str, Dict[str, Any]] = {}  # bot_id -> {task_id, state, text, updated_at}

    def _next_seq(self, task_id: str) -> int:
        if task_id not in self._seq:
            row = self.store.one("SELECT MAX(seq) AS m FROM events WHERE task_id = ?", [task_id])
            self._seq[task_id] = (row["m"] or 0) if row else 0
        self._seq[task_id] += 1
        return self._seq[task_id]

    def emit(self, task_id: str, type_: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        payload = data or {}
        with self._lock:  # atomic: seq allocation + insert
            event = {"task_id": task_id, "seq": self._next_seq(task_id), "type": type_, "data": payload, "created_at": now()}
            if not self.store.closed:
                self.store.execute(
                    "INSERT INTO events (task_id, seq, type, data, created_at) VALUES (?, ?, ?, ?, ?)",
                    [task_id, event["seq"], type_, json.dumps(payload, default=str), event["created_at"]],
                )
            subs = [s for key in (task_id, "*") for s in self._subs.get(key, [])]
        self._track_activity(event)
        for q, loop in subs:
            self._deliver(q, loop, event)
        return event

    @staticmethod
    def _deliver(q: asyncio.Queue, loop: asyncio.AbstractEventLoop, event: Dict[str, Any]) -> None:
        def put() -> None:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:  # slow consumer: it can re-sync from the log
                pass

        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is loop:
            put()
        elif not loop.is_closed():
            loop.call_soon_threadsafe(put)

    def _track_activity(self, ev: Dict[str, Any]) -> None:
        d = ev["data"]
        bot = d.get("agent") or d.get("helper")
        if not bot:
            return
        state = {"started": "working", "status": d.get("state", "working"), "answer": "done", "done": "done",
                 "error": "oops", "stopped": "idle", "cancelled": "idle", "approval_requested": "waiting"}.get(ev["type"])
        if not state:
            return
        text = d.get("text") or {"done": "Finished", "answer": "Finished", "approval_requested": "Needs your OK"}.get(ev["type"], "")
        self.activity[bot] = {"task_id": ev["task_id"], "state": state, "text": text, "updated_at": ev["created_at"]}

    def history(self, task_id: str, after_seq: int = 0) -> List[Dict[str, Any]]:
        return self.store.query(
            "SELECT task_id, seq, type, data, created_at FROM events WHERE task_id = ? AND seq > ? ORDER BY seq",
            [task_id, after_seq],
        )

    def subscribe(self, task_id: str = "*") -> asyncio.Queue:
        """Subscribe synchronously (call from inside the running event loop).

        Subscribing is synchronous on purpose: callers subscribe *before* they
        start a task, so no event can be emitted in between and lost.
        """
        q: asyncio.Queue = asyncio.Queue(maxsize=2000)
        loop = asyncio.get_running_loop()
        with self._lock:
            self._subs.setdefault(task_id, []).append((q, loop))
        return q

    def unsubscribe(self, task_id: str, q: asyncio.Queue) -> None:
        with self._lock:
            self._subs[task_id] = [s for s in self._subs.get(task_id, []) if s[0] is not q]

