"""Provider adapters + router: request shape, parsing, retries, fallback, privacy."""
from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from rewoo.models.adapters import AnthropicProvider, GeminiProvider, OllamaProvider, OpenAICompatProvider
from rewoo.models.base import Completion, Message, ModelProvider, ProviderError, ProviderSpec
from rewoo.models.router import Router


# --------------------------------------------------------------------------- helpers
def transport_of(handler):
    return httpx.MockTransport(handler)


# --------------------------------------------------------------------------- OpenAICompatProvider
def test_openai_compat_request_shape_and_parse():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={
            "choices": [{"message": {"content": "hello world"}}],
            "usage": {"prompt_tokens": 11, "completion_tokens": 3},
        })

    spec = ProviderSpec(id="oa", type="openai_compat", api_key="sk-test", model="gpt-4o-mini")
    provider = OpenAICompatProvider(spec, transport=transport_of(handler))
    completion = asyncio.run(provider.complete([Message("user", "hi")], system="be nice"))

    assert captured["url"] == "https://api.openai.com/v1/chat/completions"
    assert captured["headers"]["authorization"] == "Bearer sk-test"
    assert captured["body"]["model"] == "gpt-4o-mini"
    assert captured["body"]["messages"][0] == {"role": "system", "content": "be nice"}
    assert captured["body"]["messages"][1] == {"role": "user", "content": "hi"}

    assert isinstance(completion, Completion)
    assert completion.text == "hello world"
    assert completion.input_tokens == 11
    assert completion.output_tokens == 3
    assert completion.provider == "oa"


def test_openai_compat_no_model_configured_raises_non_retryable():
    spec = ProviderSpec(id="oa", type="openai_compat", api_key="sk-test")
    provider = OpenAICompatProvider(spec, transport=transport_of(lambda r: httpx.Response(200, json={})))
    with pytest.raises(ProviderError) as exc:
        asyncio.run(provider.complete([Message("user", "hi")]))
    assert exc.value.retryable is False


@pytest.mark.parametrize("status,expected_retryable", [(500, True), (429, True), (401, False)])
def test_openai_compat_retryable_flags(status, expected_retryable):
    def handler(request):
        return httpx.Response(status, text="boom")

    spec = ProviderSpec(id="oa", type="openai_compat", api_key="sk-test", model="gpt-4o-mini")
    provider = OpenAICompatProvider(spec, transport=transport_of(handler))
    with pytest.raises(ProviderError) as exc:
        asyncio.run(provider.complete([Message("user", "hi")]))
    assert exc.value.retryable is expected_retryable


# --------------------------------------------------------------------------- AnthropicProvider
def test_anthropic_request_shape_and_parse():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={
            "content": [{"type": "text", "text": "claude says hi"}],
            "usage": {"input_tokens": 5, "output_tokens": 4},
        })

    spec = ProviderSpec(id="an", type="anthropic", api_key="key123", model="claude-sonnet-4-5")
    provider = AnthropicProvider(spec, transport=transport_of(handler))
    completion = asyncio.run(provider.complete([Message("user", "hi")], system="be nice"))

    assert captured["url"] == "https://api.anthropic.com/v1/messages"
    assert captured["headers"]["x-api-key"] == "key123"
    assert captured["headers"]["anthropic-version"] == "2023-06-01"
    assert captured["body"]["system"] == "be nice"
    assert captured["body"]["messages"] == [{"role": "user", "content": "hi"}]

    assert completion.text == "claude says hi"
    assert completion.input_tokens == 5
    assert completion.output_tokens == 4


def test_anthropic_missing_key_raises_non_retryable():
    spec = ProviderSpec(id="an", type="anthropic", model="claude-sonnet-4-5")
    provider = AnthropicProvider(spec, transport=transport_of(lambda r: httpx.Response(200, json={})))
    with pytest.raises(ProviderError) as exc:
        asyncio.run(provider.complete([Message("user", "hi")]))
    assert exc.value.retryable is False


# --------------------------------------------------------------------------- GeminiProvider
def test_gemini_request_shape_and_parse():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url).split("?")[0]
        captured["params"] = dict(request.url.params)
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={
            "candidates": [{"content": {"parts": [{"text": "gemini reply"}]}}],
            "usageMetadata": {"promptTokenCount": 7, "candidatesTokenCount": 2},
        })

    spec = ProviderSpec(id="ge", type="gemini", api_key="gkey", model="gemini-2.5-flash")
    provider = GeminiProvider(spec, transport=transport_of(handler))
    completion = asyncio.run(provider.complete([Message("assistant", "prev"), Message("user", "hi")], system="sys"))

    assert captured["url"] == "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
    assert captured["params"]["key"] == "gkey"
    assert captured["body"]["systemInstruction"] == {"parts": [{"text": "sys"}]}
    assert captured["body"]["contents"][0]["role"] == "model"  # assistant -> model
    assert captured["body"]["contents"][1]["role"] == "user"

    assert completion.text == "gemini reply"
    assert completion.input_tokens == 7
    assert completion.output_tokens == 2


def test_gemini_no_text_raises_provider_error():
    spec = ProviderSpec(id="ge", type="gemini", api_key="gkey", model="gemini-2.5-flash")
    provider = GeminiProvider(spec, transport=transport_of(lambda r: httpx.Response(200, json={"candidates": []})))
    with pytest.raises(ProviderError):
        asyncio.run(provider.complete([Message("user", "hi")]))


# --------------------------------------------------------------------------- OllamaProvider
def test_ollama_request_shape_and_parse():
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={
            "message": {"content": "local reply"},
            "prompt_eval_count": 9,
            "eval_count": 6,
        })

    spec = ProviderSpec(id="ol", type="ollama", model="llama3.2", local=True)
    provider = OllamaProvider(spec, transport=transport_of(handler))
    completion = asyncio.run(provider.complete([Message("user", "hi")], system="sys"))

    assert captured["url"] == "http://localhost:11434/api/chat"
    assert captured["body"]["messages"][0] == {"role": "system", "content": "sys"}
    assert captured["body"]["stream"] is False

    assert completion.text == "local reply"
    assert completion.input_tokens == 9
    assert completion.output_tokens == 6
    assert completion.cost_usd == 0.0


# --------------------------------------------------------------------------- ProviderSpec.public()
def test_provider_spec_public_masks_key():
    spec = ProviderSpec(id="x", type="openai_compat", api_key="sk-1234567890")
    pub = spec.public()
    assert "api_key" not in pub
    assert pub["has_key"] is True
    assert pub["key_hint"] == "…7890"

    spec2 = ProviderSpec(id="y", type="openai_compat", api_key="")
    pub2 = spec2.public()
    assert pub2["has_key"] is False
    assert pub2["key_hint"] == ""


# --------------------------------------------------------------------------- Router fallback / chain / privacy
class FailingProvider(ModelProvider):
    def __init__(self, spec):
        super().__init__(spec)
        self.calls = 0

    async def complete(self, messages, system="", model=None, temperature=0.2, max_tokens=1200):
        self.calls += 1
        raise ProviderError("simulated outage", retryable=True)


def test_router_falls_back_to_demo_and_reports_switch(rw):
    failing = FailingProvider(ProviderSpec(id="flaky", type="openai_compat"))
    rw.router.register(failing)
    rw.store.set_setting("default_provider", "flaky")
    rw.store.set_setting("fallbacks", ["demo"])

    switches = []

    def on_switch(a, b, err):
        switches.append((a, b))

    completion = asyncio.run(rw.router.complete([Message("user", "hi TASK: hi")], on_switch=on_switch))
    assert isinstance(completion, Completion)
    assert completion.provider == "demo"
    assert failing.calls == 1
    assert switches == [("flaky", "demo")]


def test_router_chain_private_profile_only_local(rw):
    remote_spec = ProviderSpec(id="remote1", type="openai_compat", api_key="k", model="m", local=False)
    rw.router.save_spec(remote_spec.__dict__)
    rw.store.set_setting("default_provider", "remote1")
    rw.store.set_setting("fallbacks", [])

    chain = rw.router.chain(profile="private")
    assert all(p.is_local for p in chain)
    assert any(p.id == "demo" for p in chain)  # demo is local and always available


def test_router_chain_balanced_includes_remote(rw):
    remote_spec = ProviderSpec(id="remote1", type="openai_compat", api_key="k", model="m", local=False)
    rw.router.save_spec(remote_spec.__dict__)
    rw.store.set_setting("default_provider", "remote1")
    rw.store.set_setting("fallbacks", [])

    chain = rw.router.chain(profile="balanced")
    assert chain[0].id == "remote1"


def test_router_all_fail_raises_provider_error(rw):
    class AlwaysFails(ModelProvider):
        async def complete(self, messages, system="", model=None, temperature=0.2, max_tokens=1200):
            raise ProviderError("nope", retryable=False)

    p = AlwaysFails(ProviderSpec(id="demo", type="demo", local=True))
    rw.router.register(p)  # overrides the real demo id
    rw.store.set_setting("default_provider", "demo")
    with pytest.raises(ProviderError):
        asyncio.run(rw.router.complete([Message("user", "hi")]))
