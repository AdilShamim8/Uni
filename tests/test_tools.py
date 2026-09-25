"""Built-in tool safety: the sandboxed calculator and the SSRF-guarded fetcher."""
from __future__ import annotations

import asyncio

import pytest

from rewoo.tools.builtin import _is_public_url, safe_eval


def test_safe_eval_basic_arithmetic():
    assert safe_eval("1 + 2 * 3") == 7
    assert safe_eval("(1200*12)*0.15") == pytest.approx(2160.0)
    assert safe_eval("2^3") == 8  # ^ -> **
    assert safe_eval("10 % 4 * 1") == 2  # '*' present, so % stays modulo (not the %->/100 percent heuristic)


def test_safe_eval_percent_without_mult_div_becomes_division():
    assert safe_eval("50%") == pytest.approx(0.5)


def test_safe_eval_rejects_names():
    with pytest.raises(Exception):
        safe_eval("__import__('os').system('ls')")


def test_safe_eval_rejects_calls():
    with pytest.raises(Exception):
        safe_eval("abs(-1)")


def test_safe_eval_rejects_attribute_access():
    with pytest.raises(Exception):
        safe_eval("(1).__class__")


def test_safe_eval_rejects_huge_exponent():
    with pytest.raises(ValueError):
        safe_eval("2 ** 100000")


def test_is_public_url_rejects_localhost():
    assert _is_public_url("http://localhost:8000/") is False


def test_is_public_url_rejects_private_ip():
    assert _is_public_url("http://127.0.0.1/") is False
    assert _is_public_url("http://192.168.1.1/") is False
    assert _is_public_url("http://10.0.0.5/") is False


def test_is_public_url_rejects_bad_scheme():
    assert _is_public_url("file:///etc/passwd") is False
    assert _is_public_url("ftp://example.com") is False


def test_is_public_url_accepts_public_hostname(monkeypatch):
    import socket

    def fake_getaddrinfo(host, port):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)
    assert _is_public_url("https://example.com/page") is True


def test_web_fetch_refuses_localhost_via_registry(rw):
    result = asyncio.run(rw.tools.get("web_fetch").fn(_FakeCtx(rw), url="http://localhost:9999/"))
    assert result.ok is False
    assert "public web page" in result.text


class _FakeCtx:
    def __init__(self, rw):
        self.http_transport = None
        self.store = rw.store
        self.memory = rw.memory
        self.task_id = "t1"
