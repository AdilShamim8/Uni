"""OpenAI-compatible endpoint: `/v1/models` and `/v1/chat/completions`.

This makes every ReWoo Bot usable as a "model" by other software — OpenClaw
(custom provider), Hermes Agent (custom_providers), Open WebUI, scripts, IDEs…
The caller gets a Bot that has your private memory, context receipts, skills
and consent gates. Everything shows up live in the ReWoo app.

  model: "rewoo" | "rewoo/<bot_id>" | "<bot_id>"
  auth:  Authorization: Bearer <ReWoo API key>   (Settings → Connections)
  thread continuity: pass `user` (or header X-ReWoo-Thread) to keep one conversation.

Approvals requested during an API call wait for you in the ReWoo app (or are
declined automatically if Settings → "API approvals" is set to "deny").
"""
from __future__ import annotations

import asyncio
import hmac
import json
import re
import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse


_TEXT_PARTS = {"text", "input_text"}


def _content_text(content: Any) -> str:
    """Flatten an OpenAI message `content` (a string, or a list of typed parts) to plain text."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return str(content)
    pieces: List[str] = []
    for part in content:
        if isinstance(part, dict) and part.get("type") in _TEXT_PARTS:
            pieces.append(str(part.get("text") or ""))
    return "\n".join(pieces)


_BLOCK = re.compile(r"<<<BEGIN_([A-Z_]+)>>>(.*?)<<<END_\1>>>", re.S)
_META_LINE = re.compile(r"^\s*\w[\w ]{0,30}:\s*(?:[\w.-]+=[^|]*\|\s*){2,}[\w.-]+=.*$", re.M)
_STAMP = re.compile(r"^\s*\[(?:[A-Z][a-z]{2} )?\d{4}-\d{2}-\d{2}[^\]]{0,30}\]\s*")


def _clean(text: str) -> "tuple[str, str]":
    """Split an incoming message into (what the user actually said, app-provided context).

    Agent gateways (e.g. OpenClaw) wrap turns with machine context blocks
    (`<<<BEGIN_…>>> … <<<END_…>>>`), runtime metadata lines and timestamps.
    Those are kept as context, never mistaken for the request.
    """
    extra: List[str] = []

    def keep(m: "re.Match[str]") -> str:
        extra.append(m.group(2).strip())
        return ""

    body = _BLOCK.sub(keep, text or "")
    body = _META_LINE.sub(lambda m: (extra.append(m.group(0).strip()), "")[1], body)
    body = _STAMP.sub("", body.strip())
    return body.strip(), "\n".join(e for e in extra if e)


def _history(messages: List[Dict[str, Any]]) -> str:
    lines = []
    for m in messages[:-1][-8:]:
        role = m.get("role")
        if role in ("user", "assistant"):
            text = _clean(_content_text(m.get("content")))[0] if role == "user" else _content_text(m.get("content"))
            if text:
                lines.append(f"{'You' if role == 'user' else 'Assistant'}: {text[:800]}")
    return "\n".join(lines)


def build(rw) -> APIRouter:
    r = APIRouter()

    def auth(authorization: Optional[str]) -> None:
        key = rw.store.get_setting("api_key", "")
        token = (authorization or "").split(" ", 1)[1].strip() if (authorization or "").lower().startswith("bearer ") else ""
        if not key or not token or not hmac.compare_digest(key, token):
            raise HTTPException(401, detail={"error": {"message": "Invalid ReWoo API key", "type": "invalid_request_error"}})

    def resolve_bot(model: str) -> str:
        m = (model or "rewoo").strip()
        for prefix in ("rewoo/", "rewoo:"):
            if m.startswith(prefix):
                m = m[len(prefix):]
        if m in ("", "rewoo", "default"):
            return "woo"
        if not rw.helpers.exists(m):
            raise HTTPException(404, detail={"error": {"message": f"Unknown ReWoo Bot '{m}'", "type": "invalid_request_error"}})
        return m

    @r.get("/v1/models")
    def models(authorization: Optional[str] = Header(default=None)):
        auth(authorization)
        created = int(time.time())
        data = [{"id": "rewoo", "object": "model", "created": created, "owned_by": "rewoo"}]
        data += [{"id": f"rewoo/{h['id']}", "object": "model", "created": created, "owned_by": "rewoo",
                  "description": h.get("tagline", "")} for h in rw.helpers.all()]
        return {"object": "list", "data": data}

    @r.post("/v1/chat/completions")
    async def chat(request: Request, authorization: Optional[str] = Header(default=None),
                   x_rewoo_thread: Optional[str] = Header(default=None)):
        auth(authorization)
        try:
            body = await request.json()
        except ValueError:
            raise HTTPException(400, detail={"error": {"message": "Invalid JSON", "type": "invalid_request_error"}})
        messages = body.get("messages") or []
        if not messages or messages[-1].get("role") != "user":
            raise HTTPException(400, detail={"error": {"message": "The last message must be from the user",
                                                        "type": "invalid_request_error"}})
        bot = resolve_bot(body.get("model", "rewoo"))
        # The request = the most recent user message with real content (context blocks removed).
        prompt, app_ctx, last_idx = "", [], len(messages) - 1
        for i in range(len(messages) - 1, -1, -1):
            if messages[i].get("role") != "user":
                continue
            said, ctx = _clean(_content_text(messages[i].get("content")))
            if ctx:
                app_ctx.append(ctx)
            if said:
                prompt, last_idx = said, i
                break
        if not prompt:
            raise HTTPException(400, detail={"error": {"message": "No user request found", "type": "invalid_request_error"}})
        messages = messages[: last_idx + 1]
        system = "\n".join(_content_text(m.get("content")) for m in messages if m.get("role") == "system").strip()
        ref = x_rewoo_thread or body.get("user")
        thread_id = None
        if ref:
            row = rw.store.one("SELECT id FROM threads WHERE origin = 'api' AND external_ref = ?", [str(ref)])
            thread_id = row["id"] if row else rw.threads.create(prompt, bot, origin="api", external_ref=str(ref))["id"]
        full = prompt
        hist = _history(messages)
        if hist and not thread_id:
            full = f"{prompt}\n\n(Conversation so far, from the calling app)\n{hist}"
        if app_ctx:
            full = f"{full}\n\n(Context from the calling app)\n{chr(10).join(app_ctx)[:1500]}"
        if system:
            full = f"{full}\n\n(Instructions from the calling app: {system[:1500]})"
        try:
            task = rw.runtime.create_task(full, bot, thread_id=thread_id, origin="api")
        except ValueError as exc:
            raise HTTPException(400, detail={"error": {"message": str(exc), "type": "invalid_request_error"}})

        deny = rw.store.get_setting("api_approval", "ask") == "deny"
        q = rw.bus.subscribe(task["id"])  # subscribe BEFORE starting: no event can be missed
        rw.runtime.start(task["id"])
        cid = f"chatcmpl-{uuid.uuid4().hex[:24]}"
        created = int(time.time())
        model_id = f"rewoo/{bot}"

        async def events():
            try:
                while True:
                    try:
                        ev = await asyncio.wait_for(q.get(), timeout=900)
                    except asyncio.TimeoutError:
                        rw.runtime.cancel(task["id"])
                        yield {"type": "error", "data": {"message": "Timed out waiting for the Bot"}}
                        return
                    if ev["type"] == "approval_requested" and deny:
                        rw.runtime.decide(ev["data"]["id"], False)
                    yield ev
                    if ev["type"] in ("done", "error", "stopped", "cancelled"):
                        return
            finally:
                rw.bus.unsubscribe(task["id"], q)

        if body.get("stream"):
            async def gen():
                def chunk(delta: Dict[str, Any], finish: Optional[str] = None) -> str:
                    return "data: " + json.dumps({"id": cid, "object": "chat.completion.chunk", "created": created, "model": model_id,
                                                  "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}) + "\n\n"
                yield chunk({"role": "assistant"})
                streamed = ""
                async for ev in events():
                    d = ev["data"]
                    if ev["type"] == "answer_delta" and not d.get("depth"):
                        streamed += d["text"]
                        yield chunk({"content": d["text"]})
                    elif ev["type"] == "answer_reset":
                        streamed = ""
                    elif ev["type"] == "answer" and not d.get("depth"):
                        rest = d["text"][len(streamed):] if d["text"].startswith(streamed) else ""
                        if rest:
                            yield chunk({"content": rest})
                    elif ev["type"] in ("error", "stopped", "cancelled"):
                        yield chunk({"content": f"\n\n[{d.get('message') or ev['type']}]"})
                yield chunk({}, "stop")
                yield "data: [DONE]\n\n"
            return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})

        answer, error, usage = "", "", {}
        async for ev in events():
            if ev["type"] == "answer" and not ev["data"].get("depth"):
                answer = ev["data"]["text"]
            elif ev["type"] == "done":
                usage = ev["data"].get("usage") or {}
            elif ev["type"] in ("error", "stopped", "cancelled"):
                error = ev["data"].get("message") or ev["type"]
        if error and not answer:
            return JSONResponse({"error": {"message": error, "type": "rewoo_task_failed", "task_id": task["id"]}}, status_code=502)
        return {
            "id": cid, "object": "chat.completion", "created": created, "model": model_id,
            "choices": [{"index": 0, "message": {"role": "assistant", "content": answer}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": usage.get("input_tokens", 0), "completion_tokens": usage.get("output_tokens", 0),
                      "total_tokens": usage.get("input_tokens", 0) + usage.get("output_tokens", 0)},
            "rewoo": {"task_id": task["id"], "thread_id": task["thread_id"]},
        }

    return r
