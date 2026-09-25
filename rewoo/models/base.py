"""The model-agnostic contract.

The agent runtime never talks to a vendor SDK. It talks to `ModelProvider`,
which only needs to turn a list of chat messages into text. Tool use is done
with a portable JSON protocol (see `rewoo.agent.protocol`) so that *any* model —
a frontier API or a tiny local model — can drive the same agent loop.
"""
from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

import httpx


@dataclass
class Message:
    role: str  # "user" | "assistant"
    content: str


@dataclass
class Completion:
    text: str
    provider: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0


class ProviderError(Exception):
    def __init__(self, message: str, retryable: bool = True):
        super().__init__(message)
        self.retryable = retryable


@dataclass
class ProviderSpec:
    """How a provider is configured (stored in settings, editable in the UI)."""

    id: str
    type: str  # openai_compat | anthropic | gemini | ollama | demo
    name: str = ""
    base_url: str = ""
    api_key: str = ""
    model: str = ""
    embed_model: str = ""
    local: bool = False
    enabled: bool = True
    price_in: float = 0.0  # USD per 1M input tokens (optional, for budgets)
    price_out: float = 0.0  # USD per 1M output tokens
    extra: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "ProviderSpec":
        known = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in d.items() if k in known})

    def public(self) -> Dict[str, Any]:
        d = {k: getattr(self, k) for k in self.__dataclass_fields__}  # type: ignore[attr-defined]
        key = d.pop("api_key") or ""
        d["has_key"] = bool(key)
        d["key_hint"] = f"…{key[-4:]}" if len(key) >= 8 else ""
        return d


def estimate_tokens(text: str) -> int:
    """Cheap, provider-independent token estimate (~4 chars per token)."""
    return max(1, len(text) // 4)


class ModelProvider(abc.ABC):
    def __init__(self, spec: ProviderSpec, transport: Optional[httpx.AsyncBaseTransport] = None):
        self.spec = spec
        self._transport = transport

    @property
    def id(self) -> str:
        return self.spec.id

    @property
    def is_local(self) -> bool:
        return self.spec.local

    def client(self, timeout: float = 120.0) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=timeout, transport=self._transport)

    def cost(self, tin: int, tout: int) -> float:
        return (tin * self.spec.price_in + tout * self.spec.price_out) / 1_000_000

    @abc.abstractmethod
    async def complete(
        self,
        messages: List[Message],
        system: str = "",
        model: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 1200,
    ) -> Completion:
        ...

    async def stream(
        self,
        messages: List[Message],
        on_delta: Callable[[str], None],
        system: str = "",
        model: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 1200,
    ) -> Completion:
        """Stream raw text deltas to `on_delta`, then return the full Completion.

        Default: no native streaming — one delta with the whole text.
        """
        out = await self.complete(messages, system=system, model=model, temperature=temperature, max_tokens=max_tokens)
        on_delta(out.text)
        return out

    async def embed(self, texts: List[str]) -> Optional[List[List[float]]]:
        """Return embeddings or None if the provider can't embed."""
        return None

    async def health(self) -> Dict[str, Any]:
        try:
            out = await self.complete([Message("user", "Reply with the single word: ok")], max_tokens=5)
            return {"ok": True, "detail": out.text.strip()[:40], "model": out.model}
        except Exception as exc:  # noqa: BLE001 - surface any failure to the UI
            return {"ok": False, "detail": str(exc)[:300]}

    @staticmethod
    def _raise_for(resp: httpx.Response) -> None:
        if resp.status_code >= 400:
            retryable = resp.status_code in (408, 409, 429) or resp.status_code >= 500
            raise ProviderError(f"HTTP {resp.status_code}: {resp.text[:300]}", retryable=retryable)
