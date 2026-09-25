"""The portable agent protocol.

Instead of relying on each vendor's native function-calling format, ReWoo asks
every model for one small JSON object per turn. This works identically across
OpenAI, Claude, Gemini, Ollama and tiny local models, and the parser below is
forgiving (code fences, chatter around the JSON, trailing commas).
"""
from __future__ import annotations

import datetime as dt
import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from ..tools.registry import Tool


def system_prompt(helper: Dict[str, Any], tools: List[Tool], user_name: str = "", teammates: str = "") -> str:
    who = f" for {user_name}" if user_name else ""
    sigs = "\n".join(t.signature() for t in tools) or "- (no tools)"
    team = f"\nTeammates you can ask with ask_helper: {teammates}\n" if teammates and any(t.name == "ask_helper" for t in tools) else ""
    return f"""You are {helper['name']}, a helper inside ReWoo, a personal AI assistant{who}.
{helper.get('instructions') or ''}

How you work:
- You receive a TASK and numbered CONTEXT from the user's private memory. Use it and cite it as [n]. Never invent citation numbers.
- If the context is not enough, use ONE tool per turn, then look at the OBSERVATION you get back.
- "thought" is one short, friendly sentence a non-technical person understands. No jargon.
- Never claim you did something you did not do. You cannot send emails or messages — you can only draft them.
- If the user's information does not contain the answer, say so plainly instead of guessing.
{team}
Tools:
{sigs}

Reply with exactly ONE JSON object and nothing else.
To use a tool: {{"thought": "...", "tool": "tool_name", "input": {{...}}}}
To finish:     {{"thought": "...", "answer": "final answer in friendly markdown, with [n] citations where used"}}
On your first reply you may add "plan": ["short step", "..."] with 2-4 steps.
Today is {dt.date.today().strftime('%A %d %B %Y')}."""


@dataclass
class Action:
    thought: str = ""
    tool: str = ""
    input: Dict[str, Any] = field(default_factory=dict)
    answer: Optional[str] = None
    plan: List[str] = field(default_factory=list)
    raw: str = ""

    def normalized(self) -> str:
        d: Dict[str, Any] = {"thought": self.thought}
        if self.answer is not None:
            d["answer"] = self.answer
        else:
            d["tool"], d["input"] = self.tool, self.input
        return json.dumps(d, ensure_ascii=False)


class ProtocolError(ValueError):
    pass


def parse_action(text: str) -> Action:
    raw = text or ""
    cleaned = re.sub(r"```(?:json)?", "", raw).strip()
    decoder = json.JSONDecoder()
    obj = None
    for m in re.finditer(r"\{", cleaned):
        candidate = cleaned[m.start():]
        for attempt in (candidate, re.sub(r",\s*([}\]])", r"\1", candidate)):
            try:
                obj, _ = decoder.raw_decode(attempt)
                break
            except ValueError:
                continue
        if isinstance(obj, dict):
            break
        obj = None
    if not isinstance(obj, dict):
        raise ProtocolError("No JSON object found")
    answer = obj.get("answer", obj.get("final"))
    tool = obj.get("tool") or obj.get("action") or ""
    if answer is None and not tool:
        raise ProtocolError("JSON has neither 'tool' nor 'answer'")
    inp = obj.get("input") or obj.get("args") or {}
    if not isinstance(inp, dict):
        inp = {"query": str(inp)}
    plan = obj.get("plan") or []
    return Action(
        thought=str(obj.get("thought", ""))[:400],
        tool=str(tool) if answer is None else "",
        input=inp,
        answer=str(answer) if answer is not None else None,
        plan=[str(p)[:120] for p in plan][:6] if isinstance(plan, list) else [],
        raw=raw,
    )


def cited_numbers(answer: str) -> List[int]:
    return sorted({int(n) for n in re.findall(r"\[(\d{1,3})\]", answer or "")})
