"""Tools: the things a helper can *do*.

A tool is a plain async function plus a little metadata a human can read:
a friendly label ("Searching your memory"), an emoji, and a **risk level**
that decides whether ReWoo must ask you first.

Risk levels
  safe      – read-only / harmless (search, calculator, time)
  memory    – changes what ReWoo remembers about you
  external  – reaches the internet
  irreversible – would change something outside ReWoo (none ship by default;
                 ReWoo drafts emails, it never sends them)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional

RISK_ORDER = ["safe", "external", "memory", "irreversible"]

# Which risks need a human "yes" in each approval mode.
APPROVAL_MODES = {
    "cautious": {"external", "memory", "irreversible"},
    "balanced": {"memory", "irreversible"},
    "autopilot": {"irreversible"},
}


@dataclass
class ToolResult:
    text: str  # what the model sees
    data: Dict[str, Any] = field(default_factory=dict)  # what the UI shows
    context_items: List[Any] = field(default_factory=list)  # new citable context
    ok: bool = True


@dataclass
class Tool:
    name: str
    description: str
    params: Dict[str, str]
    fn: Callable[..., Awaitable[ToolResult]]
    risk: str = "safe"
    label: str = ""
    emoji: str = "🔧"

    def signature(self) -> str:
        args = ", ".join(f"{k}: {v}" for k, v in self.params.items())
        return f"- {self.name}({args}) — {self.description}"

    def public(self) -> Dict[str, Any]:
        return {"name": self.name, "description": self.description, "params": self.params,
                "risk": self.risk, "label": self.label or self.name, "emoji": self.emoji}


class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, Tool] = {}

    def register(self, tool: Tool) -> Tool:
        self._tools[tool.name] = tool
        return tool

    def tool(self, name: str, description: str, params: Dict[str, str], risk: str = "safe", label: str = "", emoji: str = "🔧"):
        """Decorator form: @registry.tool("name", "what it does", {"arg": "type"})."""
        def wrap(fn):
            self.register(Tool(name, description, params, fn, risk, label, emoji))
            return fn
        return wrap

    def get(self, name: str) -> Optional[Tool]:
        return self._tools.get(name)

    def all(self) -> List[Tool]:
        return list(self._tools.values())

    def subset(self, names: Optional[List[str]]) -> List[Tool]:
        if not names:
            return self.all()
        return [t for n in names if (t := self._tools.get(n))]


def needs_approval(tool: Tool, mode: str) -> bool:
    return tool.risk in APPROVAL_MODES.get(mode, APPROVAL_MODES["balanced"])
