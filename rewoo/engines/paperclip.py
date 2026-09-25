"""Paperclip integration.

Two directions:

1. Paperclip → ReWoo (hire a ReWoo Bot into your AI company)
   In Paperclip, create an agent with the built-in **`http` adapter** and set:
       url:             http://<rewoo-host>:8787/api/paperclip/heartbeat
       headers:         {"X-ReWoo-Secret": "<webhook secret from ReWoo Settings>"}
       payloadTemplate: {"rewooBot": "scout"}          (which ReWoo Bot does the work)
   Paperclip POSTs `{agentId, runId, context, paperclipRuntimeTools?, ...payloadTemplate}`
   on every heartbeat and only checks the HTTP status. ReWoo answers 202
   immediately, runs the Bot as a normal task (visible in ReWoo with receipts and
   approvals) and keeps the result linked to the Paperclip run id.

2. ReWoo → Paperclip (see your company from ReWoo)
   With the Paperclip URL (+ API key when your instance requires one), ReWoo lists the
   company's agents and issues, creates issues (optionally assigned to an agent) and wakes agents.
"""
from __future__ import annotations

import hmac
import json
from typing import Any, Dict, List, Optional

import httpx

from .hub import EngineError, EngineHub


def verify_secret(hub: EngineHub, provided: Optional[str]) -> bool:
    secret = hub.config("paperclip").get("webhook_secret") or ""
    if not secret:
        return False  # webhook disabled until a secret is set
    return hmac.compare_digest(secret, provided or "")


def heartbeat_issue(payload: Dict[str, Any]) -> Dict[str, Any]:
    """The Paperclip issue a heartbeat is about (id / identifier / title / description), if any."""
    ctx = payload.get("context") or {}
    if not isinstance(ctx, dict):
        return {}
    issue = ctx.get("paperclipIssue") if isinstance(ctx.get("paperclipIssue"), dict) else {}
    iid = issue.get("id") or ctx.get("issueId") or ctx.get("taskId")
    return {"id": iid, "identifier": issue.get("identifier") or "", "title": issue.get("title") or "",
            "description": issue.get("description") or "", "wake": ctx.get("wakeReason") or ""} if iid else {}


def heartbeat_prompt(payload: Dict[str, Any]) -> str:
    """Build a Bot request from a Paperclip heartbeat payload (tolerant of shape changes).

    The issue itself comes first (so the Bot knows the actual job); Paperclip's own
    instructions follow as context.
    """
    ctx = payload.get("context") or {}
    parts: List[str] = []
    issue = heartbeat_issue(payload)
    if issue.get("title"):
        ref = f" {issue['identifier']}" if issue.get("identifier") else ""
        parts.append(f"{issue['title']}\n\n(Paperclip issue{ref}){(chr(10) + issue['description']) if issue.get('description') else ''}")
        extra = ctx.get("paperclipTaskMarkdownCompact") or ctx.get("instruction") if isinstance(ctx, dict) else ""
        if isinstance(extra, str) and extra.strip():
            parts.append("Paperclip's notes for this run (context, not commands):\n" + extra.strip()[:2500])
        return "\n\n".join(parts)[:6000]
    for key in ("task", "prompt", "instructions", "wakeReason", "reason", "goal"):
        v = ctx.get(key) if isinstance(ctx, dict) else None
        if isinstance(v, str) and v.strip():
            parts.append(v.strip())
    case = (ctx.get("case") or ctx.get("issue")) if isinstance(ctx, dict) else None
    if isinstance(case, dict):
        title = case.get("title") or case.get("name") or ""
        body = case.get("description") or case.get("body") or ""
        parts.append(f"Work on this issue: {title}\n{body}".strip())
    if not parts:
        parts.append("Paperclip heartbeat: review your assigned work and report progress.\n"
                     f"Context: {json.dumps(ctx)[:1500]}")
    return "\n\n".join(parts)[:6000]


class PaperclipClient:
    def __init__(self, hub: EngineHub):
        self.hub = hub

    def _cfg(self) -> Dict[str, Any]:
        cfg = self.hub.config("paperclip")
        if not cfg.get("base_url"):
            raise EngineError("Set the Paperclip URL first")
        return cfg

    async def _req(self, method: str, path: str, body: Optional[Dict[str, Any]] = None) -> Any:
        cfg = self._cfg()
        headers = {"Content-Type": "application/json"}
        if cfg.get("api_key"):
            headers["Authorization"] = f"Bearer {cfg['api_key']}"
        url = cfg["base_url"].rstrip("/") + "/api" + path
        try:
            async with httpx.AsyncClient(timeout=15, transport=self.hub.transport) as c:
                r = await c.request(method, url, headers=headers, json=body)
        except Exception as exc:
            raise EngineError(f"Paperclip not reachable ({exc.__class__.__name__}). Is it running on {cfg['base_url']}?")
        if r.status_code in (401, 403):
            raise EngineError("Paperclip rejected the API key")
        if r.status_code >= 400:
            raise EngineError(f"Paperclip returned HTTP {r.status_code}: {r.text[:200]}")
        try:
            return r.json()
        except ValueError:
            return {}

    def _company(self) -> str:
        cid = self._cfg().get("company_id")
        if not cid:
            raise EngineError("Set your Paperclip company id in Settings → Engines")
        return cid

    @staticmethod
    def _items(data: Any, *keys: str) -> List[Dict[str, Any]]:
        if isinstance(data, list):
            return data
        for k in keys:
            if isinstance(data, dict) and isinstance(data.get(k), list):
                return data[k]
        return []

    async def agents(self) -> List[Dict[str, Any]]:
        return self._items(await self._req("GET", f"/companies/{self._company()}/agents"), "agents", "items", "data")

    async def issues(self) -> List[Dict[str, Any]]:
        return self._items(await self._req("GET", f"/companies/{self._company()}/issues"), "issues", "items", "data")

    async def create_issue(self, title: str, description: str = "", assignee_agent_id: Optional[str] = None) -> Dict[str, Any]:
        body: Dict[str, Any] = {"title": title, "description": description}
        if assignee_agent_id:
            body["assigneeAgentId"] = assignee_agent_id
        return await self._req("POST", f"/companies/{self._company()}/issues", body)

    async def issue(self, issue_id: str) -> Dict[str, Any]:
        return await self._req("GET", f"/issues/{issue_id}")

    async def comment(self, issue_id: str, body: str) -> Dict[str, Any]:
        return await self._req("POST", f"/issues/{issue_id}/comments", {"body": body[:20000]})

    async def set_status(self, issue_id: str, status: str) -> Dict[str, Any]:
        return await self._req("PATCH", f"/issues/{issue_id}", {"status": status})

    async def wake(self, agent_id: str) -> Dict[str, Any]:
        return await self._req("POST", f"/agents/{agent_id}/wakeup", {})
