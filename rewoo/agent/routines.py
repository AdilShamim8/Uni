"""Routines: Bots that work on a schedule (and "teach a task").

Inspired by Paperclip's heartbeats (MIT): an agent wakes on a schedule, checks
its work, and acts. In ReWoo a routine is a saved request for a Bot plus an
optional list of steps it was *shown* ("Teach a task"), run on a schedule.

Schedule formats (JSON):
  {"kind": "manual"}                                          run only when you press Run
  {"kind": "interval", "minutes": 60}                         every N minutes (min 5)
  {"kind": "daily", "time": "09:00", "days": ["mon", ...]}    at a local time on chosen days
                                                              (days omitted = every day)

Every routine run is a normal task — same budgets, approvals, receipts.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import logging
from typing import Any, Dict, List, Optional

from ..db import Store, new_id, now

log = logging.getLogger("rewoo.routines")
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def validate_schedule(schedule: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    s = dict(schedule or {"kind": "manual"})
    kind = s.get("kind", "manual")
    if kind == "manual":
        return {"kind": "manual"}
    if kind == "interval":
        minutes = int(s.get("minutes", 60))
        if minutes < 5:
            raise ValueError("Interval must be at least 5 minutes")
        return {"kind": "interval", "minutes": minutes}
    if kind == "daily":
        time_s = str(s.get("time", "09:00"))
        try:
            hh, mm = [int(x) for x in time_s.split(":")]
            assert 0 <= hh < 24 and 0 <= mm < 60
        except (ValueError, AssertionError):
            raise ValueError("Time must look like 09:30")
        days = [d.lower()[:3] for d in (s.get("days") or DAYS)]
        if any(d not in DAYS for d in days):
            raise ValueError("Days must be mon..sun")
        return {"kind": "daily", "time": f"{hh:02d}:{mm:02d}", "days": days}
    raise ValueError(f"Unknown schedule kind: {kind}")


def next_run(schedule: Dict[str, Any], after: Optional[float] = None) -> Optional[float]:
    """Next run time (epoch seconds, local time for 'daily') strictly after `after`."""
    after = after if after is not None else now()
    kind = schedule.get("kind", "manual")
    if kind == "interval":
        return after + int(schedule["minutes"]) * 60
    if kind == "daily":
        hh, mm = [int(x) for x in schedule["time"].split(":")]
        base = dt.datetime.fromtimestamp(after)
        for add in range(0, 8):
            day = base + dt.timedelta(days=add)
            cand = day.replace(hour=hh, minute=mm, second=0, microsecond=0)
            if DAYS[cand.weekday()] in schedule["days"] and cand.timestamp() > after:
                return cand.timestamp()
    return None


def describe(schedule: Dict[str, Any]) -> str:
    kind = schedule.get("kind", "manual")
    if kind == "interval":
        m = int(schedule["minutes"])
        return f"Every {m // 60} hour(s)" if m % 60 == 0 else f"Every {m} minutes"
    if kind == "daily":
        days = schedule.get("days") or DAYS
        when = "every day" if len(days) == 7 else ("weekdays" if days == DAYS[:5] else ", ".join(d.title() for d in days))
        return f"{when.capitalize()} at {schedule['time']}"
    return "Only when you press Run"


def build_prompt(routine: Dict[str, Any]) -> str:
    steps = routine.get("steps") or []
    if not steps:
        return routine["prompt"]
    lines = "\n".join(f"{i}. {s}" for i, s in enumerate(steps, start=1))
    return f"{routine['prompt']}\n\nFollow the routine you were taught:\n{lines}"


def steps_from_events(events: List[Dict[str, Any]]) -> List[str]:
    """Turn a finished task's event log into human-readable routine steps ("Teach a task")."""
    steps: List[str] = []
    for ev in events:
        if ev["type"] != "tool_started" or ev["data"].get("depth"):
            continue
        d = ev["data"]
        detail = ", ".join(f"{v}" for v in (d.get("input") or {}).values() if v)
        step = (d.get("label") or d.get("tool")) + (f": {detail[:120]}" if detail else "")
        if step not in steps:
            steps.append(step)
    return steps


class Routines:
    def __init__(self, store: Store):
        self.store = store

    def all(self) -> List[Dict[str, Any]]:
        rows = self.store.query("SELECT * FROM routines ORDER BY created_at DESC")
        for r in rows:
            r["enabled"] = bool(r["enabled"])
            r["schedule_text"] = describe(r["schedule"] or {})
        return rows

    def get(self, rid: str) -> Optional[Dict[str, Any]]:
        r = self.store.get("routines", rid)
        if r:
            r["enabled"] = bool(r["enabled"])
            r["schedule_text"] = describe(r["schedule"] or {})
        return r

    def create(self, bot_id: str, name: str, prompt: str, schedule: Optional[Dict[str, Any]] = None,
               steps: Optional[List[str]] = None, enabled: bool = True) -> Dict[str, Any]:
        if not prompt.strip():
            raise ValueError("A routine needs something to do")
        sched = validate_schedule(schedule)
        row = {"id": new_id("rt_"), "bot_id": bot_id, "name": name.strip() or prompt[:40], "prompt": prompt.strip(),
               "steps": [s for s in (steps or []) if str(s).strip()], "schedule": sched, "enabled": int(enabled),
               "next_run": next_run(sched) if enabled else None, "runs": 0}
        self.store.insert("routines", row)
        return self.get(row["id"])  # type: ignore[return-value]

    def update(self, rid: str, **changes: Any) -> Optional[Dict[str, Any]]:
        cur = self.get(rid)
        if not cur:
            return None
        upd: Dict[str, Any] = {}
        for k in ("name", "prompt", "bot_id", "steps"):
            if k in changes and changes[k] is not None:
                upd[k] = changes[k]
        sched = cur["schedule"]
        if changes.get("schedule") is not None:
            sched = validate_schedule(changes["schedule"])
            upd["schedule"] = sched
        enabled = cur["enabled"] if changes.get("enabled") is None else bool(changes["enabled"])
        upd["enabled"] = int(enabled)
        upd["next_run"] = next_run(sched) if enabled else None
        self.store.update("routines", rid, upd)
        return self.get(rid)

    def delete(self, rid: str) -> None:
        self.store.delete("routines", rid)

    def due(self, at: Optional[float] = None) -> List[Dict[str, Any]]:
        at = at if at is not None else now()
        return [r for r in self.all() if r["enabled"] and r["next_run"] and r["next_run"] <= at]

    def mark_ran(self, rid: str, task_id: str, at: Optional[float] = None) -> None:
        r = self.get(rid)
        if not r:
            return
        at = at if at is not None else now()
        self.store.update("routines", rid, {"last_run": at, "last_task_id": task_id, "runs": (r["runs"] or 0) + 1,
                                            "next_run": next_run(r["schedule"], at) if r["enabled"] else None})


class Scheduler:
    """Heartbeat loop: every `tick_seconds`, start tasks for routines that are due."""

    def __init__(self, routines: Routines, start_routine, tick_seconds: float = 20.0):
        self.routines = routines
        self.start_routine = start_routine  # callable(routine) -> task dict
        self.tick_seconds = tick_seconds
        self._task: Optional[asyncio.Task] = None

    def tick(self, at: Optional[float] = None) -> List[str]:
        started = []
        for r in self.routines.due(at):
            try:
                task = self.start_routine(r)
                self.routines.mark_ran(r["id"], task["id"], at)
                started.append(task["id"])
            except Exception:  # noqa: BLE001 - one broken routine must not stop the others
                log.exception("routine %s failed to start", r["id"])
        return started

    async def _loop(self) -> None:
        while True:
            try:
                self.tick()
            except Exception:  # noqa: BLE001
                log.exception("scheduler tick failed")
            await asyncio.sleep(self.tick_seconds)

    def start(self) -> None:
        if self._task is None or self._task.done():
            try:
                loop = asyncio.get_running_loop()
                self._task = loop.create_task(self._loop())
            except RuntimeError:
                self._task = asyncio.ensure_future(self._loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
            self._task = None
