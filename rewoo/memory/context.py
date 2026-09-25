"""Context engineering: deciding what the model gets to see.

We never dump files into the prompt. For each task, `ContextBuilder`:
  1. gathers candidates (pinned + relevant facts, retrieved chunks, related past conversations),
  2. applies permissions (disabled sources are invisible; *private* sources only go to local models),
  3. redacts secrets when the brain is remote,
  4. packs the best items into a token budget (relevance first, pinned facts guaranteed),
  5. returns a numbered context block AND a human-readable **context receipt**:
     what was used, what was left out, and why.

The receipt is shown in the UI next to every answer ("What I'm using").
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .store import Hit, Memory
from .text import redact


@dataclass
class ContextItem:
    n: int
    kind: str  # fact | document | episode
    title: str
    text: str
    source: str
    source_kind: str
    doc_id: str = ""
    url: str = ""
    private: bool = False
    why: List[str] = field(default_factory=list)
    tokens: int = 0

    def as_dict(self) -> Dict[str, Any]:
        return self.__dict__.copy()


@dataclass
class ContextPack:
    items: List[ContextItem]
    excluded: List[Dict[str, Any]]
    redactions: List[str]
    budget: int
    used_tokens: int
    contains_private: bool

    def block(self) -> str:
        if not self.items:
            return "(No personal context found for this task.)"
        lines = []
        for it in self.items:
            snippet = " ".join(it.text.split())
            lines.append(f"[{it.n}] {it.title} ({it.source}) — {snippet}")
        return "\n".join(lines)

    def receipt(self) -> Dict[str, Any]:
        return {
            "used": [i.as_dict() for i in self.items],
            "left_out": self.excluded,
            "secrets_hidden": len(self.redactions),
            "budget_tokens": self.budget,
            "used_tokens": self.used_tokens,
            "contains_private": self.contains_private,
        }


class ContextBuilder:
    def __init__(self, memory: Memory):
        self.memory = memory

    def build(
        self,
        query: str,
        budget_tokens: int = 2500,
        remote: bool = True,
        start_n: int = 1,
        k: int = 8,
        include_facts: bool = True,
        query_embedding: Optional[List[float]] = None,
        exclude_doc_ids: Optional[set] = None,
    ) -> ContextPack:
        excluded: List[Dict[str, Any]] = []
        redactions: List[str] = []
        exclude_doc_ids = exclude_doc_ids or set()
        if self.memory.store.get_setting("memory_paused", False):
            return ContextPack([], [{"title": "All memory", "reason": "Memory is paused"}], [], budget_tokens, 0, False)

        candidates: List[ContextItem] = []
        if include_facts:
            for f in self.memory.relevant_facts(query):
                candidates.append(ContextItem(0, "fact", "Something you told me", f["text"], "Things I remember", "facts",
                                              why=["pinned"] if f["pinned"] else ["related to your request"]))
        hits: List[Hit] = self.memory.search(query, k=k, include_private=True, query_embedding=query_embedding)
        for h in hits:
            if h.doc_id in exclude_doc_ids:
                continue
            if h.private and remote:
                excluded.append({"title": h.title, "source": h.source_name,
                                 "reason": "From a private source — only shared with on-device brains"})
                continue
            kind = "episode" if h.source_kind == "episodes" else "document"
            candidates.append(ContextItem(0, kind, h.title, h.text, h.source_name, h.source_kind, h.doc_id, h.url, h.private, h.why))

        items: List[ContextItem] = []
        used = 0
        for c in candidates:
            text = c.text
            if remote:
                text, found = redact(text)
                redactions.extend(found)
            cost = max(1, len(text) // 4) + 12
            if used + cost > budget_tokens:
                # try a trimmed version before giving up on it
                room = (budget_tokens - used - 12) * 4
                if room > 200 and c.kind != "fact":
                    text = text[:room].rsplit(" ", 1)[0] + "…"
                    cost = len(text) // 4 + 12
                else:
                    excluded.append({"title": c.title, "source": c.source, "reason": "Didn't fit in the context budget"})
                    continue
            c.text, c.tokens, c.n = text, cost, start_n + len(items)
            items.append(c)
            used += cost
        return ContextPack(items, excluded, redactions, budget_tokens, used, any(i.private for i in items))
