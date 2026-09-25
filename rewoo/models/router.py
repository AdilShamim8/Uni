"""Model router: which brain answers, and what happens when one fails.

Routing rules (in order):
  1. Profile "private" → only local providers (Ollama, LM Studio, Demo…).
  2. If the prompt contains data from a source marked *private*, remote
     providers are never used for that call (`local_only=True`).
  3. Otherwise: the user's default provider first, then the fallback chain.
Retryable errors (timeouts, 429, 5xx) fall through to the next provider;
every hop is reported so the UI can say "Switched to backup brain".
"""
from __future__ import annotations

import os
from typing import Any, Callable, Dict, List, Optional

import httpx

from ..db import Store
from .adapters import AnthropicProvider, GeminiProvider, OllamaProvider, OpenAICompatProvider
from .base import Completion, Message, ModelProvider, ProviderError, ProviderSpec
from .demo import DemoProvider

PROVIDER_TYPES = {
    "openai_compat": OpenAICompatProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
    "ollama": OllamaProvider,
    "demo": DemoProvider,
}

# Friendly presets shown in Settings → "Add a brain".
PRESETS: List[Dict[str, Any]] = [
    {"id": "openai", "type": "openai_compat", "name": "OpenAI", "base_url": "https://api.openai.com/v1", "model": "gpt-4o-mini", "embed_model": "text-embedding-3-small"},
    {"id": "anthropic", "type": "anthropic", "name": "Anthropic Claude", "model": "claude-sonnet-4-5"},
    {"id": "gemini", "type": "gemini", "name": "Google Gemini", "model": "gemini-2.5-flash", "embed_model": "text-embedding-004"},
    {"id": "openrouter", "type": "openai_compat", "name": "OpenRouter (many models)", "base_url": "https://openrouter.ai/api/v1", "model": "meta-llama/llama-3.3-70b-instruct"},
    {"id": "groq", "type": "openai_compat", "name": "Groq", "base_url": "https://api.groq.com/openai/v1", "model": "llama-3.3-70b-versatile"},
    {"id": "ollama", "type": "ollama", "name": "Ollama (on this computer)", "base_url": "http://localhost:11434", "model": "llama3.2", "local": True},
    {"id": "lmstudio", "type": "openai_compat", "name": "LM Studio (on this computer)", "base_url": "http://localhost:1234/v1", "model": "local-model", "local": True},
]

ENV_KEYS = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "groq": "GROQ_API_KEY",
}


class Router:
    def __init__(self, store: Store, transport: Optional[httpx.AsyncBaseTransport] = None, bootstrap_env: bool = True):
        self.store = store
        self.transport = transport
        self._overrides: Dict[str, ModelProvider] = {}  # for tests / plugins
        if bootstrap_env:
            self.bootstrap_from_env()

    # ------------------------------------------------------------- config
    def bootstrap_from_env(self) -> None:
        """Turn API keys found in the environment into providers (first run only)."""
        specs = {s["id"]: s for s in self.store.get_setting("providers", [])}
        changed = False
        for preset in PRESETS:
            env = ENV_KEYS.get(preset["id"])
            key = os.environ.get(env, "") if env else ""
            if key and preset["id"] not in specs:
                specs[preset["id"]] = {**preset, "api_key": key}
                changed = True
        if os.environ.get("OLLAMA_BASE_URL") and "ollama" not in specs:
            p = next(p for p in PRESETS if p["id"] == "ollama")
            specs["ollama"] = {**p, "base_url": os.environ["OLLAMA_BASE_URL"], "model": os.environ.get("OLLAMA_MODEL", p["model"])}
            changed = True
        if changed:
            self.store.set_setting("providers", list(specs.values()))
            if self.store.get_setting("default_provider") in (None, "demo"):
                self.store.set_setting("default_provider", next(iter(specs)))

    def specs(self) -> List[ProviderSpec]:
        out = [ProviderSpec.from_dict(s) for s in self.store.get_setting("providers", [])]
        if not any(s.id == "demo" for s in out):
            out.append(ProviderSpec(id="demo", type="demo", name="Demo brain (offline)", model="demo-1", local=True))
        return out

    def save_spec(self, data: Dict[str, Any]) -> ProviderSpec:
        specs = {s["id"]: s for s in self.store.get_setting("providers", [])}
        existing = specs.get(data["id"], {})
        merged = {**existing, **{k: v for k, v in data.items() if v is not None}}
        if data.get("api_key") == "" and existing.get("api_key"):
            merged["api_key"] = existing["api_key"]  # blank field in the UI = keep the old key
        if merged.get("type") not in PROVIDER_TYPES:
            raise ValueError(f"Unknown provider type: {merged.get('type')}")
        specs[merged["id"]] = merged
        self.store.set_setting("providers", list(specs.values()))
        return ProviderSpec.from_dict(merged)

    def remove_spec(self, pid: str) -> None:
        specs = [s for s in self.store.get_setting("providers", []) if s["id"] != pid]
        self.store.set_setting("providers", specs)
        if self.store.get_setting("default_provider") == pid:
            self.store.set_setting("default_provider", "demo")

    def register(self, provider: ModelProvider) -> None:
        """Inject a provider instance directly (tests, plugins)."""
        self._overrides[provider.id] = provider

    def get(self, pid: str) -> Optional[ModelProvider]:
        if pid in self._overrides:
            return self._overrides[pid]
        for spec in self.specs():
            if spec.id == pid:
                return PROVIDER_TYPES[spec.type](spec, transport=self.transport)
        return None

    # ------------------------------------------------------------ routing
    def chain(self, profile: str = "balanced", local_only: bool = False) -> List[ModelProvider]:
        default = self.store.get_setting("default_provider", "demo")
        fallbacks = self.store.get_setting("fallbacks", [])
        order: List[str] = []
        for pid in [default, *fallbacks]:
            if pid and pid not in order:
                order.append(pid)
        providers = [p for p in (self.get(pid) for pid in order) if p and p.spec.enabled]
        for pid, p in self._overrides.items():
            if pid not in order:
                providers.append(p)
        if profile == "private" or local_only:
            providers = [p for p in providers if p.is_local]
        if not providers:
            providers = [self.get("demo")]  # type: ignore[list-item]
        return providers

    def primary(self, profile: str = "balanced") -> ModelProvider:
        return self.chain(profile)[0]

    async def complete(
        self,
        messages: List[Message],
        system: str = "",
        profile: str = "balanced",
        local_only: bool = False,
        on_switch: Optional[Callable[[str, str, str], None]] = None,
        **kw: Any,
    ) -> Completion:
        errors: List[str] = []
        chain = self.chain(profile, local_only)
        for i, provider in enumerate(chain):
            try:
                return await provider.complete(messages, system=system, **kw)
            except ProviderError as exc:
                errors.append(f"{provider.id}: {exc}")
                nxt = chain[i + 1].id if i + 1 < len(chain) else ""
                if on_switch and nxt:
                    on_switch(provider.id, nxt, str(exc))
                if not exc.retryable and not nxt:
                    break
        raise ProviderError("All brains failed. " + " | ".join(errors), retryable=False)

    async def embed(self, texts: List[str]) -> Optional[List[List[float]]]:
        pid = self.store.get_setting("embedder", "local")
        if pid == "local":
            return None
        p = self.get(pid)
        return await p.embed(texts) if p else None
