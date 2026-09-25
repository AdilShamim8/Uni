"""The Demo brain.

A deterministic, offline "model" that speaks ReWoo's JSON action protocol.
It exists so that:
  1. anyone can install ReWoo and see the whole product work with no API key,
  2. the test suite and eval harness are fully reproducible.

It is intentionally simple — rules, not intelligence. Connect a real model in
Settings for real reasoning.
"""
from __future__ import annotations

import json
import re
from typing import List, Optional

from .base import Completion, Message, ModelProvider, ProviderSpec, estimate_tokens

URL_RE = re.compile(r"https?://[^\s)>\]]+")
MATH_RE = re.compile(r"(?<![\w.])(\d[\d\s.,]*\s*[-+*/x×%^]\s*[\d\s.,()+\-*/x×%^]+)")


def _task_from(messages: List[Message]) -> str:
    first = messages[0].content if messages else ""
    m = re.search(r"TASK:\s*(.+?)(?:\n\n|$)", first, re.S)
    return (m.group(1) if m else first).strip()


def _actions_taken(messages: List[Message]) -> List[str]:
    tools = []
    for m in messages:
        if m.role != "assistant":
            continue
        try:
            obj = json.loads(m.content)
            if obj.get("tool"):
                tools.append(obj["tool"])
        except ValueError:
            continue
    return tools


def _observations(messages: List[Message]) -> List[str]:
    return [m.content for m in messages if m.role == "user" and m.content.startswith("OBSERVATION")]


def _snippets(text: str) -> List[str]:
    """Pull '[n] title — snippet' lines out of context / search observations."""
    return re.findall(r"^\s*(\[\d+\][^\n]+)", text, re.M)


class DemoProvider(ModelProvider):
    def __init__(self, spec: Optional[ProviderSpec] = None, transport=None):
        super().__init__(spec or ProviderSpec(id="demo", type="demo", name="Demo brain (offline)", model="demo-1", local=True))

    async def complete(self, messages, system="", model=None, temperature=0.2, max_tokens=1200) -> Completion:
        text = self._decide(messages, system)
        tin = estimate_tokens(system + "".join(m.content for m in messages))
        return Completion(text, self.id, self.spec.model or "demo-1", tin, estimate_tokens(text), 0.0)

    async def stream(self, messages, on_delta, system="", model=None, temperature=0.2, max_tokens=1200) -> Completion:
        """Simulated streaming so the offline demo feels alive (chunked, small delay)."""
        import asyncio

        out = await self.complete(messages, system=system)
        delay = float(self.spec.extra.get("typing_delay", 0.0)) if self.spec.extra else 0.0
        text = out.text
        step = 12
        for i in range(0, len(text), step):
            on_delta(text[i:i + step])
            if delay:
                await asyncio.sleep(delay)
        return out

    async def health(self):
        return {"ok": True, "detail": "Demo brain is always available (offline, rule-based).", "model": "demo-1"}

    # ------------------------------------------------------------------ rules
    def _decide(self, messages: List[Message], system: str) -> str:
        if not messages:
            return json.dumps({"answer": "Hi! I'm ReWoo."})
        if "TASK:" not in messages[0].content:  # health checks / plain chat
            return "ok"
        task = _task_from(messages)
        low = task.lower()
        done = _actions_taken(messages)
        obs = _observations(messages)
        allowed = set(re.findall(r"^- (\w+)\(", system, re.M))

        def act(tool, inp, thought, plan=None):
            if allowed and tool not in allowed:
                return None
            d = {"thought": thought, "tool": tool, "input": inp}
            if plan and not done:
                d["plan"] = plan
            return json.dumps(d)

        choice = None
        remember = re.search(r"\bremember (?:that )?(.+)", task, re.I | re.S)
        if remember and "remember_fact" not in done:
            fact = remember.group(1).strip().rstrip(".")
            choice = act("remember_fact", {"fact": fact}, "You asked me to remember something — I'll ask before saving it.",
                         ["Save this to my memory (with your OK)", "Confirm"])
        elif "calculator" not in done and ("calculate" in low or (MATH_RE.search(task) and re.search(r"\b(what'?s|what is|how much)\b|=\s*\?", low))):
            m = MATH_RE.search(task)
            expr = (m.group(1) if m else re.sub(r"[^0-9+\-*/(). %]", "", task)).replace("x", "*").replace("×", "*").strip()
            choice = act("calculator", {"expression": expr}, "Let me do the math carefully.", ["Calculate", "Explain the result"])
        elif ("remind me to" in low or "to-do" in low or "todo" in low) and "add_todo" not in done:
            item = re.sub(r"(?i).*?(remind me to|add (a )?(to-?do|todo)( to)?:?)\s*", "", task).strip() or task
            choice = act("add_todo", {"text": item[:200]}, "I'll put that on your to-do list.", ["Add to-do", "Confirm"])
        elif "email" in low and ("draft" in low or "write" in low) and "draft_email" not in done:
            if "search_memory" not in done:
                choice = act("search_memory", {"query": task}, "First, let me check your notes for anything relevant.",
                             ["Look through your memory", "Draft the email", "Hand it to you to review"])
            else:
                ctx = "\n".join(s.split("—", 1)[-1].strip() for s in _snippets("\n".join(obs))[:2])
                body = "Hi,\n\n" + ("Following up based on my notes: " + ctx[:400] if ctx else "I wanted to follow up on this.") + "\n\nBest regards,"
                choice = act("draft_email", {"to": "", "subject": task[:70], "body": body}, "Writing a draft for you — nothing gets sent.")
        elif URL_RE.search(task) and "web_fetch" not in done:
            choice = act("web_fetch", {"url": URL_RE.search(task).group(0)}, "Opening that page to read it.", ["Read the page", "Summarize it"])
        elif ("note" in low and ("save" in low or "write" in low or "make" in low)) and "save_note" not in done:
            choice = act("save_note", {"title": task[:60], "content": task}, "Saving this as a note.")
        elif "search_memory" not in done and not done:
            choice = act("search_memory", {"query": task}, "Looking through your memory for anything related…",
                         ["Search your files and notes", "Pick the most relevant bits", "Answer with sources"])
        if choice:
            return choice
        return json.dumps({"thought": "I have what I need — writing your answer.", "answer": self._answer(task, messages, obs)})

    def _answer(self, task: str, messages: List[Message], obs: List[str]) -> str:
        last = obs[-1] if obs else ""
        tail = "\n\n_(Answered by the offline Demo brain. Connect a real model in Settings for smarter answers.)_"
        if "calculator" in last:
            m = re.search(r"=\s*(.+)$", last.strip(), re.M)
            return f"The answer is **{m.group(1).strip() if m else last}**." + tail
        if "denied" in last.lower():
            return "No problem — I didn't do that. Let me know if you'd like something else." + tail
        for key, msg in (("remember_fact", "Got it — I'll remember that. You can see or forget it anytime in **Memory**."),
                         ("add_todo", "Done — it's on your to-do list in **Library**."),
                         ("draft_email", "Your draft is ready in **Library → Drafts**. I didn't send anything."),
                         ("save_note", "Saved! Your note is in **Library** and I'll be able to find it later.")):
            if key in last:
                return msg + tail
        if "web_fetch" in last:
            body = last.split("\n", 1)[-1].strip()
            return "Here's the gist of that page:\n\n> " + body[:500].replace("\n", " ") + "…" + tail
        snippets = _snippets("\n".join([messages[0].content] + obs))
        seen, lines = set(), []
        for s in snippets:
            n = s.split("]")[0] + "]"
            if n in seen:
                continue
            seen.add(n)
            lines.append(s)
        if not lines:
            return ("I couldn't find anything about that in your memory yet. "
                    "Add files in **Memory** (upload or connect Google Drive) and ask me again!" + tail)
        bullets = "\n".join(f"- {line.split(']', 1)[1].strip()} {line.split(']')[0]}]" for line in lines[:4])
        return f"Here's what I found in your stuff about **{task[:80]}**:\n\n{bullets}" + tail
