"""Engine hub: configuration, health checks and task execution for external engines."""
from __future__ import annotations

import asyncio
import os
import shutil
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import httpx

from ..db import Store
from ..models.adapters import OpenAICompatProvider
from ..models.base import Completion, Message, ProviderError, ProviderSpec

REPO_ROOT = Path(__file__).resolve().parents[2]
VENDORED = REPO_ROOT / "engines"

ENGINE_INFO: Dict[str, Dict[str, Any]] = {
    "rewoo": {
        "name": "ReWoo", "kind": "runtime", "license": "Apache-2.0",
        "tagline": "Built-in runtime: private memory, consent gates, receipts, any model.",
    },
    "hermes": {
        "name": "Hermes Agent", "kind": "runtime", "license": "MIT (Nous Research)",
        "upstream": "https://github.com/NousResearch/hermes-agent",
        "tagline": "Self-improving agent that learns skills from experience.",
        "defaults": {"mode": "api", "base_url": "http://127.0.0.1:8642/v1", "api_key": "", "model": "hermes-agent",
                     "cli": "hermes", "cli_args": ["-Q"]},
    },
    "openclaw": {
        "name": "OpenClaw", "kind": "runtime", "license": "MIT (OpenClaw Foundation)",
        "upstream": "https://github.com/openclaw/openclaw",
        "tagline": "Your agent on WhatsApp, Telegram, Slack, Discord and more.",
        "defaults": {"base_url": "http://127.0.0.1:18789/v1", "token": "", "agent": "default"},
    },
    "paperclip": {
        "name": "Paperclip", "kind": "orchestrator", "license": "MIT (Paperclip AI)",
        "upstream": "https://github.com/paperclipai/paperclip",
        "tagline": "Run a whole AI company: org chart, goals, budgets, heartbeats.",
        "defaults": {"base_url": "http://127.0.0.1:3100", "api_key": "", "company_id": "", "webhook_secret": ""},
    },
}


class EngineError(Exception):
    pass


class EngineHub:
    def __init__(self, store: Store, transport: Optional[httpx.AsyncBaseTransport] = None):
        self.store = store
        self.transport = transport

    # -------------------------------------------------------------- config
    def config(self, engine: str) -> Dict[str, Any]:
        defaults = dict(ENGINE_INFO.get(engine, {}).get("defaults", {}))
        saved = (self.store.get_setting("engines", {}) or {}).get(engine, {})
        env = {
            "hermes": {"base_url": os.environ.get("HERMES_API_URL"), "api_key": os.environ.get("HERMES_API_KEY")},
            "openclaw": {"base_url": os.environ.get("OPENCLAW_GATEWAY_URL"), "token": os.environ.get("OPENCLAW_GATEWAY_TOKEN")},
            "paperclip": {"base_url": os.environ.get("PAPERCLIP_API_URL"), "api_key": os.environ.get("PAPERCLIP_API_KEY")},
        }.get(engine, {})
        return {**defaults, **{k: v for k, v in env.items() if v}, **saved}

    def save_config(self, engine: str, values: Dict[str, Any]) -> Dict[str, Any]:
        if engine not in ENGINE_INFO or engine == "rewoo":
            raise EngineError(f"Unknown engine: {engine}")
        allowed = set(ENGINE_INFO[engine].get("defaults", {}))
        all_cfg = self.store.get_setting("engines", {}) or {}
        cur = all_cfg.get(engine, {})
        for k, v in values.items():
            if k not in allowed:
                continue
            if k in ("api_key", "token", "webhook_secret") and v == "":
                continue  # blank = keep existing secret
            cur[k] = v
        all_cfg[engine] = cur
        self.store.set_setting("engines", all_cfg)
        return self.public_config(engine)

    def public_config(self, engine: str) -> Dict[str, Any]:
        cfg = self.config(engine)
        out = {}
        for k, v in cfg.items():
            if k in ("api_key", "token", "webhook_secret"):
                out[f"{k}_set"] = bool(v)
            else:
                out[k] = v
        return out

    def vendored(self, engine: str) -> Dict[str, Any]:
        folder = {"hermes": "hermes-agent", "openclaw": "openclaw", "paperclip": "paperclip"}.get(engine)
        path = VENDORED / folder if folder else None
        return {"present": bool(path and (path / "LICENSE").exists()), "path": str(path) if path else ""}

    # --------------------------------------------------------------- health
    async def status(self, engine: str) -> Dict[str, Any]:
        info = {**{k: v for k, v in ENGINE_INFO[engine].items() if k != "defaults"}, "id": engine,
                "config": self.public_config(engine) if engine != "rewoo" else {}, "vendored": self.vendored(engine)}
        if engine == "rewoo":
            return {**info, "ok": True, "detail": "Always on"}
        try:
            detail = await self._probe(engine)
            return {**info, "ok": True, "detail": detail}
        except Exception as exc:  # noqa: BLE001 - surfaced to the UI
            return {**info, "ok": False, "detail": str(exc)[:300]}

    async def all_status(self) -> List[Dict[str, Any]]:
        return list(await asyncio.gather(*(self.status(e) for e in ENGINE_INFO)))

    async def _probe(self, engine: str) -> str:
        cfg = self.config(engine)
        if engine == "hermes" and cfg.get("mode") == "cli":
            exe = shutil.which(cfg.get("cli") or "hermes")
            if not exe:
                raise EngineError("Hermes CLI not found on PATH. Install: pip install hermes-agent (Python 3.11+)")
            return f"CLI found at {exe}"
        base = cfg["base_url"].rstrip("/")
        headers = {}
        secret = cfg.get("api_key") or cfg.get("token")
        if secret:
            headers["Authorization"] = f"Bearer {secret}"
        url = f"{base}/models" if engine in ("hermes", "openclaw") else f"{base}/api/health"
        try:
            async with httpx.AsyncClient(timeout=6, transport=self.transport) as c:
                r = await c.get(url, headers=headers)
        except Exception as exc:
            raise EngineError(f"Not reachable at {base} ({exc.__class__.__name__}). Is it running?")
        if r.status_code in (401, 403):
            raise EngineError("Reachable, but the key/token was rejected")
        if r.status_code >= 400:
            raise EngineError(f"Reachable, but returned HTTP {r.status_code}")
        return f"Connected to {base}"

    # ------------------------------------------------------------------ run
    def _client(self, engine: str) -> OpenAICompatProvider:
        cfg = self.config(engine)
        if engine == "hermes":
            spec = ProviderSpec(id="engine:hermes", type="openai_compat", name="Hermes Agent", base_url=cfg["base_url"],
                                api_key=cfg.get("api_key", ""), model=cfg.get("model") or "hermes-agent")
        elif engine == "openclaw":
            agent = cfg.get("agent") or "default"
            spec = ProviderSpec(id="engine:openclaw", type="openai_compat", name="OpenClaw", base_url=cfg["base_url"],
                                api_key=cfg.get("token", ""), model=f"openclaw/{agent}")
        else:
            raise EngineError(f"{engine} can't run tasks directly")
        return OpenAICompatProvider(spec, transport=self.transport)

    async def run(self, engine: str, bot: Dict[str, Any], prompt: str, history: str, context_block: str,
                  on_delta: Callable[[str], None]) -> Completion:
        """Send one turn to an external agent engine and stream its answer back."""
        cfg = self.config(engine)
        system = (
            f"You are '{bot['name']}', a Bot inside ReWoo. {bot.get('instructions') or ''}\n"
            "The user's private context below was selected by ReWoo for this request. "
            "Cite items as [n] when you use them.\n\nCONTEXT:\n" + (context_block or "(none)")
        )
        messages: List[Message] = []
        if history:
            messages.append(Message("user", f"(Earlier in this conversation)\n{history}"))
            messages.append(Message("assistant", "Understood."))
        messages.append(Message("user", prompt))
        if engine == "hermes" and cfg.get("mode") == "cli":
            return await self._run_hermes_cli(cfg, system, prompt, history, on_delta)
        client = self._client(engine)
        try:
            return await client.stream(messages, on_delta, system=system, max_tokens=4000)
        except ProviderError as exc:
            raise EngineError(f"{ENGINE_INFO[engine]['name']}: {exc}")

    async def _run_hermes_cli(self, cfg: Dict[str, Any], system: str, prompt: str, history: str,
                              on_delta: Callable[[str], None]) -> Completion:
        exe = shutil.which(cfg.get("cli") or "hermes")
        if not exe:
            raise EngineError("Hermes CLI not found on PATH. Install: pip install hermes-agent (Python 3.11+)")
        # Request first, then ReWoo's selected context (keeps short CLI prompts readable).
        query = (f"{prompt}\n\n---\n{system}"
                 + (f"\n\nConversation so far:\n{history}" if history else ""))
        proc = await asyncio.create_subprocess_exec(
            exe, "chat", "-q", query, *(cfg.get("cli_args") or ["-Q"]),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, stdin=asyncio.subprocess.DEVNULL,
        )
        parts: List[str] = []
        assert proc.stdout is not None
        try:
            while True:
                chunk = await asyncio.wait_for(proc.stdout.read(256), timeout=1800)
                if not chunk:
                    break
                text = chunk.decode("utf-8", "ignore")
                parts.append(text)
                on_delta(text)
        except asyncio.TimeoutError:
            proc.kill()
            raise EngineError("Hermes took too long (30 min) and was stopped")
        code = await proc.wait()
        if code != 0 and not parts:
            err = (await proc.stderr.read()).decode("utf-8", "ignore")[-400:] if proc.stderr else ""
            raise EngineError(f"Hermes exited with code {code}: {err}")
        text = "".join(parts).strip()
        return Completion(text, "engine:hermes", "hermes-cli", 0, 0, 0.0)
