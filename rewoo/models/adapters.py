"""Concrete provider adapters.

- OpenAICompatProvider: OpenAI, OpenRouter, Groq, Together, DeepSeek, Mistral,
  vLLM, LM Studio, llama.cpp server… anything speaking /v1/chat/completions.
- AnthropicProvider: Claude via the Messages API.
- GeminiProvider: Google Gemini via generateContent.
- OllamaProvider: local models via Ollama.

Adding a provider = one class with `complete()` (and optionally `embed()`).
"""
from __future__ import annotations

import json
from typing import Callable, List, Optional

from .base import Completion, Message, ModelProvider, ProviderError, estimate_tokens


async def _sse_lines(resp):
    """Yield the payload of each `data:` line of a Server-Sent-Events response."""
    async for line in resp.aiter_lines():
        line = line.strip()
        if line.startswith("data:"):
            yield line[5:].strip()


class OpenAICompatProvider(ModelProvider):
    default_base = "https://api.openai.com/v1"

    def _headers(self):
        h = {"Content-Type": "application/json"}
        if self.spec.api_key:
            h["Authorization"] = f"Bearer {self.spec.api_key}"
        return h

    async def complete(self, messages, system="", model=None, temperature=0.2, max_tokens=1200) -> Completion:
        model = model or self.spec.model
        if not model:
            raise ProviderError("No model configured for this provider", retryable=False)
        payload_msgs = ([{"role": "system", "content": system}] if system else []) + [
            {"role": m.role, "content": m.content} for m in messages
        ]
        base = (self.spec.base_url or self.default_base).rstrip("/")
        try:
            async with self.client() as c:
                r = await c.post(
                    f"{base}/chat/completions",
                    headers=self._headers(),
                    json={"model": model, "messages": payload_msgs, "temperature": temperature, "max_tokens": max_tokens},
                )
        except Exception as exc:  # network errors
            raise ProviderError(f"Could not reach {base}: {exc}") from exc
        self._raise_for(r)
        data = r.json()
        try:
            text = data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError) as exc:
            raise ProviderError(f"Unexpected response shape: {str(data)[:200]}") from exc
        usage = data.get("usage") or {}
        tin = usage.get("prompt_tokens") or estimate_tokens(system + "".join(m.content for m in messages))
        tout = usage.get("completion_tokens") or estimate_tokens(text)
        return Completion(text, self.id, model, tin, tout, self.cost(tin, tout))

    async def stream(self, messages, on_delta: Callable[[str], None], system="", model=None, temperature=0.2, max_tokens=1200) -> Completion:
        model = model or self.spec.model
        if not model:
            raise ProviderError("No model configured for this provider", retryable=False)
        payload_msgs = ([{"role": "system", "content": system}] if system else []) + [
            {"role": m.role, "content": m.content} for m in messages
        ]
        base = (self.spec.base_url or self.default_base).rstrip("/")
        parts: List[str] = []
        usage = {}
        try:
            async with self.client() as c:
                async with c.stream("POST", f"{base}/chat/completions", headers=self._headers(), json={
                    "model": model, "messages": payload_msgs, "temperature": temperature, "max_tokens": max_tokens,
                    "stream": True, "stream_options": {"include_usage": True},
                }) as r:
                    if r.status_code >= 400:
                        await r.aread()
                        self._raise_for(r)
                    async for data in _sse_lines(r):
                        if data == "[DONE]":
                            break
                        try:
                            obj = json.loads(data)
                        except ValueError:
                            continue
                        usage = obj.get("usage") or usage
                        for ch in obj.get("choices") or []:
                            delta = (ch.get("delta") or {}).get("content")
                            if delta:
                                parts.append(delta)
                                on_delta(delta)
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError(f"Streaming from {base} failed: {exc}") from exc
        text = "".join(parts)
        tin = usage.get("prompt_tokens") or estimate_tokens(system + "".join(m.content for m in messages))
        tout = usage.get("completion_tokens") or estimate_tokens(text)
        return Completion(text, self.id, model, tin, tout, self.cost(tin, tout))

    async def embed(self, texts: List[str]) -> Optional[List[List[float]]]:
        if not self.spec.embed_model:
            return None
        base = (self.spec.base_url or self.default_base).rstrip("/")
        async with self.client() as c:
            r = await c.post(f"{base}/embeddings", headers=self._headers(), json={"model": self.spec.embed_model, "input": texts})
        self._raise_for(r)
        return [row["embedding"] for row in r.json()["data"]]


class AnthropicProvider(ModelProvider):
    default_base = "https://api.anthropic.com/v1"

    async def complete(self, messages, system="", model=None, temperature=0.2, max_tokens=1200) -> Completion:
        model = model or self.spec.model or "claude-sonnet-4-5"
        if not self.spec.api_key:
            raise ProviderError("Anthropic API key missing", retryable=False)
        base = (self.spec.base_url or self.default_base).rstrip("/")
        body = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
        }
        if system:
            body["system"] = system
        try:
            async with self.client() as c:
                r = await c.post(
                    f"{base}/messages",
                    headers={"x-api-key": self.spec.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json=body,
                )
        except Exception as exc:
            raise ProviderError(f"Could not reach Anthropic: {exc}") from exc
        self._raise_for(r)
        data = r.json()
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        usage = data.get("usage") or {}
        tin, tout = usage.get("input_tokens", 0), usage.get("output_tokens", 0)
        return Completion(text, self.id, model, tin, tout, self.cost(tin, tout))


    async def stream(self, messages, on_delta: Callable[[str], None], system="", model=None, temperature=0.2, max_tokens=1200) -> Completion:
        model = model or self.spec.model or "claude-sonnet-4-5"
        if not self.spec.api_key:
            raise ProviderError("Anthropic API key missing", retryable=False)
        base = (self.spec.base_url or self.default_base).rstrip("/")
        body = {"model": model, "max_tokens": max_tokens, "temperature": temperature, "stream": True,
                "messages": [{"role": m.role, "content": m.content} for m in messages]}
        if system:
            body["system"] = system
        parts: List[str] = []
        tin = tout = 0
        try:
            async with self.client() as c:
                async with c.stream("POST", f"{base}/messages", json=body, headers={
                    "x-api-key": self.spec.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}) as r:
                    if r.status_code >= 400:
                        await r.aread()
                        self._raise_for(r)
                    async for data in _sse_lines(r):
                        try:
                            ev = json.loads(data)
                        except ValueError:
                            continue
                        t = ev.get("type")
                        if t == "content_block_delta" and (ev.get("delta") or {}).get("type") == "text_delta":
                            parts.append(ev["delta"]["text"])
                            on_delta(ev["delta"]["text"])
                        elif t == "message_start":
                            tin = ((ev.get("message") or {}).get("usage") or {}).get("input_tokens", 0)
                        elif t == "message_delta":
                            tout = (ev.get("usage") or {}).get("output_tokens", tout)
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError(f"Streaming from Anthropic failed: {exc}") from exc
        text = "".join(parts)
        return Completion(text, self.id, model, tin, tout, self.cost(tin, tout))


class GeminiProvider(ModelProvider):
    default_base = "https://generativelanguage.googleapis.com/v1beta"

    async def complete(self, messages, system="", model=None, temperature=0.2, max_tokens=1200) -> Completion:
        model = model or self.spec.model or "gemini-2.5-flash"
        if not self.spec.api_key:
            raise ProviderError("Gemini API key missing", retryable=False)
        base = (self.spec.base_url or self.default_base).rstrip("/")
        body = {
            "contents": [
                {"role": "model" if m.role == "assistant" else "user", "parts": [{"text": m.content}]} for m in messages
            ],
            "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
        }
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        try:
            async with self.client() as c:
                r = await c.post(f"{base}/models/{model}:generateContent", params={"key": self.spec.api_key}, json=body)
        except Exception as exc:
            raise ProviderError(f"Could not reach Gemini: {exc}") from exc
        self._raise_for(r)
        data = r.json()
        try:
            parts = data["candidates"][0]["content"]["parts"]
            text = "".join(p.get("text", "") for p in parts)
        except (KeyError, IndexError) as exc:
            raise ProviderError(f"Gemini returned no text: {str(data)[:200]}") from exc
        meta = data.get("usageMetadata") or {}
        tin, tout = meta.get("promptTokenCount", 0), meta.get("candidatesTokenCount", 0)
        return Completion(text, self.id, model, tin, tout, self.cost(tin, tout))

    async def embed(self, texts):
        if not self.spec.embed_model:
            return None
        base = (self.spec.base_url or self.default_base).rstrip("/")
        m = self.spec.embed_model
        async with self.client() as c:
            r = await c.post(
                f"{base}/models/{m}:batchEmbedContents",
                params={"key": self.spec.api_key},
                json={"requests": [{"model": f"models/{m}", "content": {"parts": [{"text": t}]}} for t in texts]},
            )
        self._raise_for(r)
        return [e["values"] for e in r.json()["embeddings"]]


class OllamaProvider(ModelProvider):
    default_base = "http://localhost:11434"

    async def complete(self, messages, system="", model=None, temperature=0.2, max_tokens=1200) -> Completion:
        model = model or self.spec.model or "llama3.2"
        base = (self.spec.base_url or self.default_base).rstrip("/")
        msgs = ([{"role": "system", "content": system}] if system else []) + [
            {"role": m.role, "content": m.content} for m in messages
        ]
        try:
            async with self.client(timeout=300) as c:
                r = await c.post(
                    f"{base}/api/chat",
                    json={"model": model, "messages": msgs, "stream": False, "options": {"temperature": temperature, "num_predict": max_tokens}},
                )
        except Exception as exc:
            raise ProviderError(f"Could not reach Ollama at {base} — is it running? ({exc})") from exc
        self._raise_for(r)
        data = r.json()
        text = (data.get("message") or {}).get("content", "")
        tin, tout = data.get("prompt_eval_count", 0), data.get("eval_count", 0)
        return Completion(text, self.id, model, tin, tout, 0.0)

    async def stream(self, messages, on_delta: Callable[[str], None], system="", model=None, temperature=0.2, max_tokens=1200) -> Completion:
        model = model or self.spec.model or "llama3.2"
        base = (self.spec.base_url or self.default_base).rstrip("/")
        msgs = ([{"role": "system", "content": system}] if system else []) + [{"role": m.role, "content": m.content} for m in messages]
        parts: List[str] = []
        tin = tout = 0
        try:
            async with self.client(timeout=300) as c:
                async with c.stream("POST", f"{base}/api/chat", json={
                    "model": model, "messages": msgs, "stream": True,
                    "options": {"temperature": temperature, "num_predict": max_tokens}}) as r:
                    if r.status_code >= 400:
                        await r.aread()
                        self._raise_for(r)
                    async for line in r.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            obj = json.loads(line)
                        except ValueError:
                            continue
                        delta = (obj.get("message") or {}).get("content")
                        if delta:
                            parts.append(delta)
                            on_delta(delta)
                        if obj.get("done"):
                            tin, tout = obj.get("prompt_eval_count", 0), obj.get("eval_count", 0)
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError(f"Could not reach Ollama at {base} — is it running? ({exc})") from exc
        return Completion("".join(parts), self.id, model, tin, tout, 0.0)

    async def embed(self, texts):
        if not self.spec.embed_model:
            return None
        base = (self.spec.base_url or self.default_base).rstrip("/")
        async with self.client() as c:
            r = await c.post(f"{base}/api/embed", json={"model": self.spec.embed_model, "input": texts})
        self._raise_for(r)
        return r.json()["embeddings"]
