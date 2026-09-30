"""Built-in tools. Each one is small, readable, and safe by default."""
from __future__ import annotations

import ast
import datetime as dt
import ipaddress
import operator
import socket
from typing import Any, Dict
from urllib.parse import urlparse

import httpx

from ..db import new_id
from ..memory.text import html_to_text
from .registry import ToolRegistry, ToolResult

_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
    ast.Pow: operator.pow, ast.Mod: operator.mod, ast.FloorDiv: operator.floordiv,
    ast.USub: operator.neg, ast.UAdd: operator.pos,
}


def safe_eval(expr: str) -> float:
    """Evaluate arithmetic without `eval` — no names, no calls, no attributes."""
    expr = expr.replace("^", "**").replace("×", "*").replace(",", "")
    if "%" in expr and not any(c in expr for c in "*/"):
        expr = expr.replace("%", "/100")

    def ev(node):
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
            left, right = ev(node.left), ev(node.right)
            if isinstance(node.op, ast.Pow) and abs(right) > 100:
                raise ValueError("exponent too large")
            return _OPS[type(node.op)](left, right)
        if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
            return _OPS[type(node.op)](ev(node.operand))
        raise ValueError("Only numbers and + - * / ^ % ( ) are allowed")

    return ev(ast.parse(expr.strip(), mode="eval"))


def _is_public_url(url: str) -> bool:
    """Block requests to localhost / private networks (SSRF guard)."""
    try:
        p = urlparse(url)
        if p.scheme not in ("http", "https") or not p.hostname:
            return False
        for info in socket.getaddrinfo(p.hostname, None):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return False
        return True
    except Exception:  # noqa: BLE001
        return False


class FetchBlocked(Exception):
    pass


MAX_FETCH_BYTES = 2 * 1024 * 1024
UA = {"User-Agent": "ReWoo/0.2 (+https://github.com/AdilShamim8/ReWoo)"}


async def fetch_public(url: str, transport=None, max_redirects: int = 5):
    """GET a public web page safely.

    Redirects are followed manually so that *every* hop is re-validated against
    the SSRF guard (no redirect into localhost / private networks / cloud
    metadata). The body is capped at 2 MB.
    """
    current = url
    async with httpx.AsyncClient(timeout=20, follow_redirects=False, transport=transport) as c:
        for _ in range(max_redirects + 1):
            if not _is_public_url(current):
                raise FetchBlocked("that address (or a redirect) isn't a public web page.")
            async with c.stream("GET", current, headers=UA) as r:
                if 300 <= r.status_code < 400 and "location" in r.headers:
                    current = str(r.url.join(r.headers["location"]))
                    continue
                chunks, size = [], 0
                async for chunk in r.aiter_bytes():
                    size += len(chunk)
                    chunks.append(chunk)
                    if size > MAX_FETCH_BYTES:
                        break
                raw = b"".join(chunks)[:MAX_FETCH_BYTES]
                body = raw.decode(r.encoding or "utf-8", "ignore")
                text = html_to_text(body) if "html" in r.headers.get("content-type", "") else body
                return text, current
    raise FetchBlocked("too many redirects.")


def register_builtin_tools(reg: ToolRegistry) -> ToolRegistry:
    @reg.tool("search_memory", "Search the user's personal memory (files, Google Drive, notes, past conversations).",
              {"query": "what to look for"}, label="Searching your memory", emoji="🔎")
    async def search_memory(ctx, query: str = "", **_: Any) -> ToolResult:
        pack = ctx.search(query)
        if not pack.items:
            return ToolResult("Nothing new found — anything relevant is already in your CONTEXT above.",
                              {"found": 0, "left_out": pack.excluded})
        return ToolResult(pack.block(), {"found": len(pack.items), "items": [i.as_dict() for i in pack.items], "left_out": pack.excluded},
                          context_items=pack.items)

    @reg.tool("read_document", "Read more of one document from memory by its citation number.",
              {"n": "citation number, e.g. 2"}, label="Reading a document", emoji="📖")
    async def read_document(ctx, n: Any = 0, **_: Any) -> ToolResult:
        item = ctx.citation(int(n)) if str(n).isdigit() else None
        if not item or not item.doc_id:
            return ToolResult("That citation is not a document.", ok=False)
        doc = ctx.memory.read_document(item.doc_id)
        if not doc:
            return ToolResult("Document not available (it may have been removed or its source turned off).", ok=False)
        if doc["private"] and ctx.remote:
            return ToolResult("This document is private and can only be read by an on-device brain.", ok=False)
        return ToolResult(f"[{n}] {doc['title']}\n{doc['text']}", {"title": doc["title"], "chars": len(doc["text"])})

    @reg.tool("remember_fact", "Save a short fact about the user to long-term memory (asks the user first).",
              {"fact": "one short sentence"}, risk="memory", label="Remembering something", emoji="💡")
    async def remember_fact(ctx, fact: str = "", **_: Any) -> ToolResult:
        if not fact.strip():
            return ToolResult("Nothing to remember.", ok=False)
        row = ctx.memory.add_fact(fact, source_task=ctx.task_id)
        return ToolResult(f"remember_fact: saved '{row['text']}'", {"fact": row["text"], "id": row["id"]})

    @reg.tool("calculator", "Do exact arithmetic.", {"expression": "e.g. (1200*12)*0.15"}, label="Doing the math", emoji="🧮")
    async def calculator(ctx, expression: str = "", **_: Any) -> ToolResult:
        try:
            value = safe_eval(expression)
        except Exception as exc:  # noqa: BLE001
            return ToolResult(f"calculator error: {exc}", ok=False)
        pretty = f"{value:,.4f}".rstrip("0").rstrip(".") if isinstance(value, float) else f"{value:,}"
        return ToolResult(f"calculator: {expression} = {pretty}", {"expression": expression, "result": pretty})

    @reg.tool("current_time", "Get today's date and time.", {}, label="Checking the date", emoji="🕒")
    async def current_time(ctx, **_: Any) -> ToolResult:
        now = dt.datetime.now().astimezone()
        return ToolResult(f"current_time: {now.strftime('%A %d %B %Y, %H:%M %Z')}", {"now": now.isoformat()})

    @reg.tool("web_fetch", "Read the text of a public web page.", {"url": "https://..."}, risk="external",
              label="Reading a web page", emoji="🌐")
    async def web_fetch(ctx, url: str = "", **_: Any) -> ToolResult:
        try:
            text, final_url = await fetch_public(url, transport=ctx.http_transport)
        except FetchBlocked as exc:
            return ToolResult(f"web_fetch: {exc}", ok=False)
        except Exception as exc:  # noqa: BLE001
            return ToolResult(f"web_fetch: couldn't open the page ({exc})", ok=False)
        return ToolResult(f"web_fetch {final_url}\n{text[:6000]}", {"url": final_url, "chars": len(text)})

    @reg.tool("save_note", "Save a note for the user (it also becomes searchable memory).",
              {"title": "short title", "content": "the note"}, label="Saving a note", emoji="📝")
    async def save_note(ctx, title: str = "", content: str = "", **_: Any) -> ToolResult:
        nid = new_id("note_")
        ctx.store.insert("notes", {"id": nid, "title": title or "Note", "content": content, "task_id": ctx.task_id})
        if not ctx.store.get_setting("memory_paused", False):
            ctx.memory.add_document("src_notes", title or "Note", content, external_id=nid)
        return ToolResult(f"save_note: saved '{title}'", {"id": nid, "title": title})

    @reg.tool("add_todo", "Add an item to the user's to-do list.", {"text": "the to-do", "due": "optional date"},
              label="Adding a to-do", emoji="✅")
    async def add_todo(ctx, text: str = "", due: str = "", **_: Any) -> ToolResult:
        tid = new_id("todo_")
        ctx.store.insert("todos", {"id": tid, "text": text, "due": due, "done": 0, "task_id": ctx.task_id})
        return ToolResult(f"add_todo: added '{text}'", {"id": tid, "text": text, "due": due})

    @reg.tool("list_todos", "See the user's open to-dos.", {}, label="Checking your to-dos", emoji="📋")
    async def list_todos(ctx, **_: Any) -> ToolResult:
        rows = ctx.store.query("SELECT text, due FROM todos WHERE done = 0 ORDER BY created_at")
        body = "\n".join(f"- {r['text']}" + (f" (due {r['due']})" if r["due"] else "") for r in rows) or "No open to-dos."
        return ToolResult(f"list_todos:\n{body}", {"count": len(rows)})

    @reg.tool("draft_email", "Write an email DRAFT for the user to review. Never sends anything.",
              {"to": "recipient (optional)", "subject": "subject", "body": "email text"}, label="Drafting an email", emoji="✉️")
    async def draft_email(ctx, to: str = "", subject: str = "", body: str = "", **_: Any) -> ToolResult:
        did = new_id("draft_")
        ctx.store.insert("drafts", {"id": did, "kind": "email", "to_addr": to, "subject": subject, "body": body, "task_id": ctx.task_id})
        return ToolResult(f"draft_email: draft saved ('{subject}')", {"id": did, "subject": subject, "to": to, "body": body})

    @reg.tool("ask_helper", "Hand a sub-task to another helper and get their answer back.",
              {"helper": "helper id, e.g. scout", "request": "what you need from them"}, label="Asking a teammate", emoji="🤝")
    async def ask_helper(ctx, helper: str = "", request: str = "", **_: Any) -> ToolResult:
        if ctx.depth >= 1:
            return ToolResult("Helpers can't delegate further — do it yourself.", ok=False)
        answer = await ctx.delegate(helper, request)
        return ToolResult(f"ask_helper ({helper}) answered:\n{answer}", {"helper": helper, "answer": answer[:500]})

    return reg


def default_registry() -> ToolRegistry:
    return register_builtin_tools(ToolRegistry())


def tool_catalog(reg: ToolRegistry) -> Dict[str, Dict[str, Any]]:
    return {t.name: t.public() for t in reg.all()}
