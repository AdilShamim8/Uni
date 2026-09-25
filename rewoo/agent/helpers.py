"""Bots (a.k.a. helpers): your AI teammates.

The "AI company" projects model agents as employees in an org chart. For a
personal OS that's the wrong metaphor — nobody wants to manage a company to
get their day sorted. ReWoo keeps the useful part (specialised roles with
scoped tools and hand-offs) and drops the corporate ceremony: a Bot is a name,
a job, a personality, a set of tools, a privacy profile — and an *engine*:
ReWoo's own runtime by default, or Hermes Agent / OpenClaw for power users.
"""
from __future__ import annotations

from typing import Any, Dict, List

from ..db import Store, new_id

ENGINES = ("rewoo", "hermes", "openclaw")

BUILTIN_HELPERS: List[Dict[str, Any]] = [
    {
        "id": "woo", "name": "Woo", "emoji": "🟣", "color": "#7C5CFF",
        "tagline": "Your chief of staff. Can do a bit of everything and delegates to the team.", "job": "Chief of Staff",
        "instructions": "Be warm, brief and practical. Prefer the user's own information over general knowledge. "
                        "If a teammate is clearly better for part of the job, you may ask_helper.",
        "tools": [], "profile": "balanced",
    },
    {
        "id": "scout", "name": "Scout", "emoji": "🔭", "color": "#18B8A6",
        "tagline": "Finds things in your files and on the web, then sums them up.", "job": "Research",
        "instructions": "You are a careful researcher. Search before answering, read documents when snippets are thin, "
                        "and always cite sources. Summaries should be skimmable: short bullets, key facts first.",
        "tools": ["search_memory", "read_document", "web_fetch", "current_time"], "profile": "balanced",
    },
    {
        "id": "quill", "name": "Quill", "emoji": "✍️", "color": "#FF7A59",
        "tagline": "Writes emails, notes and replies that sound like you.", "job": "Writing & Outreach",
        "instructions": "You write clear, human drafts. Look at the user's notes for tone and facts first. "
                        "You only ever DRAFT — never claim something was sent.",
        "tools": ["search_memory", "read_document", "draft_email", "save_note"], "profile": "balanced",
    },
    {
        "id": "tally", "name": "Tally", "emoji": "🧮", "color": "#F5B400",
        "tagline": "Numbers, budgets, plans and to-do lists.", "job": "Planner & Money",
        "instructions": "Always use the calculator for arithmetic — never do math in your head. "
                        "Turn plans into concrete to-dos when asked.",
        "tools": ["calculator", "add_todo", "list_todos", "current_time", "search_memory"], "profile": "balanced",
    },
    {
        "id": "hush", "name": "Hush", "emoji": "🔒", "color": "#4A6CF7",
        "tagline": "Private mode. Only uses brains that run on your own computer.", "job": "Private matters",
        "instructions": "You handle sensitive matters. Be discreet and concise.",
        "tools": ["search_memory", "read_document", "save_note", "calculator"], "profile": "private",
    },
]


class Helpers:
    def __init__(self, store: Store):
        self.store = store
        for h in BUILTIN_HELPERS:
            existing = store.get("helpers", h["id"])
            if not existing:
                store.insert("helpers", {**h, "builtin": 1, "engine": "rewoo"})
            elif not existing.get("job"):
                store.update("helpers", h["id"], {"job": h.get("job", ""), "tagline": h["tagline"]})

    def all(self) -> List[Dict[str, Any]]:
        rows = self.store.query("SELECT * FROM helpers ORDER BY builtin DESC, created_at")
        for r in rows:
            r["builtin"] = bool(r["builtin"])
            r["engine"] = r.get("engine") or "rewoo"
        return rows

    def get(self, hid: str) -> Dict[str, Any]:
        row = self.store.get("helpers", hid) or self.store.get("helpers", "woo")
        if row:
            row["engine"] = row.get("engine") or "rewoo"
        return row  # type: ignore[return-value]

    def exists(self, hid: str) -> bool:
        return self.store.get("helpers", hid) is not None

    def create(self, data: Dict[str, Any]) -> Dict[str, Any]:
        row = {
            "id": data.get("id") or new_id("h_"), "name": data.get("name") or "New helper",
            "emoji": data.get("emoji") or "✨", "color": data.get("color") or "#7C5CFF",
            "tagline": data.get("tagline", ""), "instructions": data.get("instructions", ""),
            "tools": data.get("tools") or [], "profile": data.get("profile") or "balanced", "builtin": 0,
            "job": data.get("job", ""), "engine": data.get("engine") or "rewoo", "engine_config": data.get("engine_config") or {},
        }
        if row["engine"] not in ENGINES:
            raise ValueError(f"Unknown engine: {row['engine']}")
        return self.store.insert("helpers", row)

    def update(self, hid: str, data: Dict[str, Any]) -> None:
        allowed = {k: v for k, v in data.items() if k in ("name", "emoji", "color", "tagline", "instructions", "tools",
                                                          "profile", "job", "engine", "engine_config")}
        if "engine" in allowed and allowed["engine"] not in ENGINES:
            raise ValueError(f"Unknown engine: {allowed['engine']}")
        self.store.update("helpers", hid, allowed)

    def delete(self, hid: str) -> None:
        row = self.store.get("helpers", hid)
        if row and not row["builtin"]:
            self.store.delete("helpers", hid)
