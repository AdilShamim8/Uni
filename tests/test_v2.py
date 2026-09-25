"""v2 features: threads, streaming, skills, routines, OpenAI-compatible API, engines,
Paperclip webhook, Telegram channel, and regression tests for the audit fixes."""
from __future__ import annotations

import asyncio
import json
import time

import httpx
import pytest

from rewoo.agent.protocol import AnswerStream
from rewoo.agent.routines import next_run, steps_from_events, validate_schedule
from rewoo.agent.skills import parse_skill_md, render_skill_md
from rewoo.api.routes_memory import OAuthStates
from rewoo.harness.runner import auto_approver
from rewoo.models.base import Completion, ModelProvider, ProviderSpec, estimate_tokens


def wait_done(client, tid, timeout=10):
    end = time.time() + timeout
    while time.time() < end:
        t = client.get(f"/api/tasks/{tid}").json()["task"]
        if t["status"] in ("done", "failed", "stopped", "cancelled", "interrupted"):
            return t
        time.sleep(0.05)
    raise AssertionError("task did not finish")


# ------------------------------------------------------------------ threads
def test_thread_follow_up_sees_history(rw):
    first = asyncio.run(rw.ask("Remind me to water the plants"))
    seen = {}

    class Spy(ModelProvider):
        async def complete(self, messages, system="", model=None, temperature=0.2, max_tokens=1200):
            seen["prompt"] = messages[0].content
            text = json.dumps({"thought": "ok", "answer": "Sure."})
            return Completion(text, self.id, "spy", 1, 1, 0.0)

    rw.router.register(Spy(ProviderSpec(id="spy", type="demo", model="spy", local=True)))
    rw.store.set_setting("default_provider", "spy")
    second = asyncio.run(rw.ask("and make it daily", thread_id=first["thread_id"]))
    assert second["thread_id"] == first["thread_id"]
    assert "CONVERSATION SO FAR" in seen["prompt"] and "water the plants" in seen["prompt"]
    assert len(rw.threads.turns(first["thread_id"])) == 2


def test_create_task_rejects_empty_and_unknown_thread(rw):
    with pytest.raises(ValueError):
        rw.runtime.create_task("   ")
    with pytest.raises(ValueError):
        rw.runtime.create_task("hi", thread_id="th_missing")


# ---------------------------------------------------------------- streaming
def test_answer_streams_as_deltas(rw):
    rw.memory.add_document("src_uploads", "Lease", "Monthly rent is 42000 BDT due on the 5th.", external_id="l")
    task = asyncio.run(rw.ask("When is rent due?"))
    ev = rw.bus.history(task["id"])
    deltas = "".join(e["data"]["text"] for e in ev if e["type"] == "answer_delta")
    assert deltas and deltas == task["result"]


def test_answer_stream_extractor_handles_split_escapes():
    raw = json.dumps({"thought": "t", "answer": 'He said "hi"\\n and left ✓'})
    a = AnswerStream()
    out = "".join(a.feed(ch) for ch in raw)
    assert out == 'He said "hi"\\n and left ✓' and a.done


def test_openai_compat_stream_parsing():
    chunks = [
        'data: {"choices":[{"delta":{"content":"{\\"answer\\": \\"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo\\"}"}}]}\n\n',
        'data: {"usage":{"prompt_tokens":5,"completion_tokens":3},"choices":[]}\n\n',
        "data: [DONE]\n\n",
    ]

    def handler(request):
        body = json.loads(request.content)
        assert body["stream"] is True
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, content="".join(chunks).encode())

    from rewoo.models.adapters import OpenAICompatProvider
    p = OpenAICompatProvider(ProviderSpec(id="x", type="openai_compat", base_url="http://llm/v1", model="m"),
                             transport=httpx.MockTransport(handler))
    got = []
    out = asyncio.run(p.stream([], got.append))
    assert out.text == '{"answer": "Hello"}' and "".join(got) == out.text
    assert out.input_tokens == 5 and out.output_tokens == 3


# ------------------------------------------------------------------- skills
def test_skill_proposed_after_multi_tool_run_and_reused(rw):
    rw.memory.add_document("src_uploads", "Landlord.txt", "Landlord: Mr. Rahman. Heater broken.", external_id="ll")
    task = asyncio.run(rw.ask("Draft an email to my landlord about the broken heater", helper="quill"))
    proposed = rw.skills.all("proposed")
    assert task["status"] == "done" and len(proposed) == 1
    assert any(e["type"] == "skill_proposed" for e in rw.bus.history(task["id"]))
    skill = rw.skills.update(proposed[0]["id"], status="active")
    from pathlib import Path
    assert skill["path"] and Path(skill["path"]).read_text(encoding="utf-8").startswith("---\nname:")
    again = asyncio.run(rw.ask("Draft an email to my landlord about the broken heater again", helper="quill"))
    assert any(e["type"] == "skills_used" for e in rw.bus.history(again["id"]))
    assert rw.skills.get(skill["id"])["uses"] >= 1
    assert len(rw.skills.all("proposed")) == 0  # no duplicate proposal when a skill was used


def test_learning_off_disables_proposals(rw):
    rw.store.set_setting("learning", "off")
    asyncio.run(rw.ask("Draft an email to my landlord about rent", helper="quill"))
    assert rw.skills.all("proposed") == []


def test_skill_md_roundtrip_and_import(rw, tmp_path):
    md = render_skill_md({"name": "rent-check", "description": "Check rent: amount & date", "body": "# Steps\n1. search", "version": "1.2.0"})
    parsed = parse_skill_md(md)
    assert parsed["name"] == "rent-check" and parsed["version"] == "1.2.0" and "search" in parsed["body"]
    lib = tmp_path / "lib" / "productivity" / "notes-helper"
    lib.mkdir(parents=True)
    (lib / "SKILL.md").write_text("---\nname: notes-helper\ndescription: Organize notes\nversion: 1.0.0\n---\n# Do it", encoding="utf-8")
    assert rw.skills.import_dir(tmp_path / "lib", source="hermes") == 1
    row = rw.skills.by_name("notes-helper")
    assert row["source"] == "hermes" and row["status"] == "disabled" and row["category"] == "productivity"
    assert rw.skills.import_dir(tmp_path / "lib") == 0  # idempotent


# ----------------------------------------------------------------- routines
def test_schedule_validation_and_next_run():
    assert validate_schedule({"kind": "interval", "minutes": 30}) == {"kind": "interval", "minutes": 30}
    with pytest.raises(ValueError):
        validate_schedule({"kind": "interval", "minutes": 1})
    with pytest.raises(ValueError):
        validate_schedule({"kind": "daily", "time": "25:00"})
    s = validate_schedule({"kind": "daily", "time": "09:00", "days": ["mon"]})
    import datetime as dt
    nxt = dt.datetime.fromtimestamp(next_run(s, time.time()))
    assert nxt.weekday() == 0 and nxt.hour == 9 and nxt.minute == 0
    assert next_run({"kind": "manual"}) is None


def test_scheduler_tick_runs_due_routine(rw):
    async def go():
        r = rw.routines.create("tally", "Water", "Remind me to water the plants", {"kind": "interval", "minutes": 5})
        started = rw.scheduler.tick(at=time.time() + 400)
        assert len(started) == 1
        task = await rw.runtime.wait(started[0], timeout=10)
        row = rw.routines.get(r["id"])
        assert task["status"] == "done" and task["origin"] == "routine"
        assert row["runs"] == 1 and row["next_run"] > time.time()
        assert rw.scheduler.tick(at=time.time()) == []  # not due again yet
    asyncio.run(go())


def test_teach_a_task_creates_routine_with_steps(client, rw):
    rw.memory.add_document("src_uploads", "Lease", "Rent is 42000 BDT due on the 5th", external_id="l")
    t = client.post("/api/tasks", json={"prompt": "When is my rent due?", "helper_id": "scout"}).json()
    wait_done(client, t["id"])
    r = client.post(f"/api/routines/from-task/{t['id']}", json={"name": "Rent check", "schedule": {"kind": "daily", "time": "08:00"}})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["bot_id"] == "scout" and body["steps"] and body["schedule_text"].startswith("Every day")
    run = client.post(f"/api/routines/{body['id']}/run").json()
    done = wait_done(client, run["id"])
    assert done["status"] == "done" and "Follow the routine" in done["prompt"]


def test_steps_from_events_skips_subagents():
    evs = [{"type": "tool_started", "data": {"label": "Searching", "input": {"query": "rent"}}},
           {"type": "tool_started", "data": {"label": "Nested", "depth": 1, "input": {}}}]
    assert steps_from_events(evs) == ["Searching: rent"]


# ------------------------------------------------------- OpenAI-compatible
def test_v1_requires_key_and_answers(client, rw):
    assert client.get("/v1/models").status_code == 401
    key = rw.store.get_setting("api_key")
    h = {"Authorization": f"Bearer {key}"}
    models = client.get("/v1/models", headers=h).json()["data"]
    assert {"rewoo", "rewoo/woo", "rewoo/scout"} <= {m["id"] for m in models}
    r = client.post("/v1/chat/completions", headers=h, json={"model": "rewoo/tally",
                    "messages": [{"role": "user", "content": "Calculate 6 * 7"}]})
    assert r.status_code == 200, r.text
    assert "42" in r.json()["choices"][0]["message"]["content"]
    bad = client.post("/v1/chat/completions", headers=h, json={"model": "rewoo/nobody", "messages": [{"role": "user", "content": "x"}]})
    assert bad.status_code == 404


def test_v1_streaming_sse(client, rw):
    h = {"Authorization": f"Bearer {rw.store.get_setting('api_key')}"}
    with client.stream("POST", "/v1/chat/completions", headers=h, json={
            "model": "rewoo", "stream": True, "messages": [{"role": "user", "content": "Calculate 2 + 3"}]}) as r:
        lines = [ln for ln in r.iter_lines() if ln.startswith("data: ")]
    assert lines[-1] == "data: [DONE]"
    text = "".join(json.loads(ln[6:])["choices"][0]["delta"].get("content", "") for ln in lines[:-1])
    assert "5" in text


def test_v1_thread_continuity_via_user_field(client, rw):
    h = {"Authorization": f"Bearer {rw.store.get_setting('api_key')}"}
    for msg in ("Remind me to buy milk", "Remind me to buy eggs"):
        client.post("/v1/chat/completions", headers=h, json={"model": "rewoo", "user": "app-42",
                    "messages": [{"role": "user", "content": msg}]})
    threads = rw.store.query("SELECT * FROM threads WHERE origin = 'api' AND external_ref = 'app-42'")
    assert len(threads) == 1 and len(rw.threads.turns(threads[0]["id"])) == 2


# ------------------------------------------------------------------ engines
def test_openclaw_engine_bot_streams_answer(rw):
    calls = {}

    def handler(request):
        calls["auth"] = request.headers.get("authorization")
        body = json.loads(request.content)
        calls["model"] = body["model"]
        calls["system"] = body["messages"][0]["content"]
        sse = ('data: {"choices":[{"delta":{"content":"Hello from "}}]}\n\n'
               'data: {"choices":[{"delta":{"content":"OpenClaw"}}]}\n\ndata: [DONE]\n\n')
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=sse.encode())

    rw.engines.transport = httpx.MockTransport(handler)
    rw.engines.save_config("openclaw", {"base_url": "http://gw:18789/v1", "token": "tok123", "agent": "main"})
    rw.memory.add_document("src_uploads", "Trip", "Cox's Bazar trip in December", external_id="t")
    bot = rw.helpers.create({"name": "Claw", "engine": "openclaw"})
    task = asyncio.run(rw.ask("Tell me about my trip", helper=bot["id"]))
    assert task["status"] == "done" and task["result"] == "Hello from OpenClaw"
    assert calls["auth"] == "Bearer tok123" and calls["model"] == "openclaw/main"
    assert "Cox's Bazar" in calls["system"]  # ReWoo memory was provided as context
    types = [e["type"] for e in rw.bus.history(task["id"])]
    assert "context" in types and "answer_delta" in types


def test_engine_unreachable_fails_gracefully(rw):
    def handler(request):
        raise httpx.ConnectError("refused")

    rw.engines.transport = httpx.MockTransport(handler)
    bot = rw.helpers.create({"name": "Herm", "engine": "hermes"})
    task = asyncio.run(rw.ask("hi", helper=bot["id"]))
    assert task["status"] == "failed" and "Hermes" in task["error"]
    st = asyncio.run(rw.engines.status("hermes"))
    assert st["ok"] is False and "Not reachable" in st["detail"]


def test_unknown_engine_rejected(rw):
    with pytest.raises(ValueError):
        rw.helpers.create({"name": "X", "engine": "nope"})


def test_engine_secrets_never_returned(client):
    client.put("/api/engines/hermes", json={"api_key": "supersecret", "base_url": "http://h:8642/v1"})
    body = client.get("/api/engines").json()
    hermes = next(e for e in body["engines"] if e["id"] == "hermes")
    assert "supersecret" not in json.dumps(body) and hermes["config"]["api_key_set"] is True
    assert "openclaw" in body["snippets"] and "/v1" in body["snippets"]["hermes"]


# ---------------------------------------------------------------- paperclip
def test_paperclip_heartbeat_requires_secret_and_runs_bot(client, rw):
    payload = {"agentId": "agt_1", "runId": "run_9", "rewooBot": "tally", "context": {"task": "Calculate 10 * 10"}}
    assert client.post("/api/paperclip/heartbeat", json=payload).status_code == 401  # no secret configured yet
    client.put("/api/engines/paperclip", json={"webhook_secret": "s3cret"})
    assert client.post("/api/paperclip/heartbeat", json=payload, headers={"X-ReWoo-Secret": "nope"}).status_code == 401
    r = client.post("/api/paperclip/heartbeat", json=payload, headers={"X-ReWoo-Secret": "s3cret"})
    assert r.status_code == 202
    task = wait_done(client, r.json()["task_id"])
    assert task["status"] == "done" and "100" in task["result"] and task["helper_id"] == "tally"
    again = client.post("/api/paperclip/heartbeat", json=payload, headers={"X-ReWoo-Secret": "s3cret"}).json()
    assert again["thread_id"] == r.json()["thread_id"]  # one thread per Paperclip agent


def test_paperclip_client_lists_agents(rw):
    def handler(request):
        assert request.headers["authorization"] == "Bearer pk"
        assert request.url.path == "/api/companies/c1/agents"
        return httpx.Response(200, json={"agents": [{"id": "a1", "name": "CEO"}]})

    rw.engines.transport = httpx.MockTransport(handler)
    rw.engines.save_config("paperclip", {"base_url": "http://pc:3100", "api_key": "pk", "company_id": "c1"})
    from rewoo.engines.paperclip import PaperclipClient
    assert asyncio.run(PaperclipClient(rw.engines).agents()) == [{"id": "a1", "name": "CEO"}]


# ----------------------------------------------------------------- telegram
class FakeTelegram:
    def __init__(self):
        self.sent = []
        self.updates = []
        self.answered = []

    def handler(self, request):
        method = request.url.path.rsplit("/", 1)[-1]
        body = json.loads(request.content or b"{}")
        if method == "getMe":
            return httpx.Response(200, json={"ok": True, "result": {"username": "rewoo_bot"}})
        if method == "getUpdates":
            ups, self.updates = self.updates, []
            return httpx.Response(200, json={"ok": True, "result": ups})
        if method == "sendMessage":
            self.sent.append(body)
        if method == "answerCallbackQuery":
            self.answered.append(body)
        return httpx.Response(200, json={"ok": True, "result": True})


def test_telegram_pairing_chat_and_approval(rw):
    fake = FakeTelegram()
    rw.channels.transport = httpx.MockTransport(fake.handler)
    ch = rw.channels.add_telegram("TG", "123:ABC", "woo")
    code = rw.store.get("channels", ch["id"])["config"]["pair_code"]
    tg = rw.channels.connector(ch["id"])

    async def go():
        fake.updates = [{"update_id": 1, "message": {"chat": {"id": 55}, "text": "hello"}}]
        await tg.poll_once()
        assert "isn't paired" in fake.sent[-1]["text"]
        fake.updates = [{"update_id": 2, "message": {"chat": {"id": 55}, "text": f"/start {code}"}}]
        await tg.poll_once()
        assert "Paired" in fake.sent[-1]["text"]
        fake.updates = [{"update_id": 3, "message": {"chat": {"id": 55}, "text": "Remember that I love mangoes"}}]
        await tg.poll_once()
        for _ in range(100):
            if any("reply_markup" in m for m in fake.sent):
                break
            await asyncio.sleep(0.02)
        ask = next(m for m in fake.sent if "reply_markup" in m)
        data = ask["reply_markup"]["inline_keyboard"][0][0]["callback_data"]
        fake.updates = [{"update_id": 4, "callback_query": {"id": "cb1", "data": data, "message": {"chat": {"id": 55}}}}]
        await tg.poll_once()
        for _ in range(100):
            if any("remember" in m["text"].lower() and "Memory" in m["text"] for m in fake.sent):
                break
            await asyncio.sleep(0.02)
    asyncio.run(go())
    assert fake.answered and fake.answered[0]["text"] == "Allowed"
    assert any("mangoes" in f["text"] for f in rw.memory.facts())
    assert rw.store.get("channels", ch["id"])["config"]["offset"] == 5
    assert "123:ABC" not in json.dumps(rw.channels.list())


def test_telegram_rejects_bad_token(rw):
    with pytest.raises(ValueError):
        rw.channels.add_telegram("x", "not-a-token")


# ------------------------------------------------------------ audit fixes
def test_close_releases_db_and_is_idempotent(tmp_path):
    from rewoo.config import Config
    from rewoo.core import ReWoo
    app = ReWoo(Config(data_dir=tmp_path), db_path=str(tmp_path / "x.db"), bootstrap_env=False)
    app.close()
    app.close()
    import os
    os.remove(tmp_path / "x.db")  # would fail on Windows if the connection were still open


def test_auto_approver_subscribes_before_first_await(rw):
    async def go():
        approver = asyncio.ensure_future(auto_approver(rw, approve=True))  # no sleep(0) on purpose
        try:
            return await asyncio.wait_for(rw.ask("Remember that my cat is called Miso"), timeout=5)
        finally:
            approver.cancel()
    assert asyncio.run(go())["status"] == "done"
    assert any("Miso" in f["text"] for f in rw.memory.facts())


def test_event_seq_unique_under_threads(rw):
    import threading
    task = rw.runtime.create_task("hello")

    def spam():
        for _ in range(50):
            rw.bus.emit(task["id"], "status", {"text": "x"})

    ts = [threading.Thread(target=spam) for _ in range(4)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    seqs = [e["seq"] for e in rw.bus.history(task["id"])]
    assert len(seqs) == len(set(seqs)) == 201


def test_oauth_states_bounded_and_expiring():
    s = OAuthStates()
    first = s.new()
    for _ in range(200):
        s.new()
    assert len(s) <= 50 and not s.consume(first)
    tok = s.new()
    assert s.consume(tok) and not s.consume(tok)


def test_web_fetch_blocks_redirect_to_private(rw):
    from rewoo.tools import builtin

    def handler(request):
        if request.url.host == "public.example":
            return httpx.Response(302, headers={"location": "http://127.0.0.1:8787/api/settings"})
        return httpx.Response(200, text="SECRET")

    orig = builtin._is_public_url
    builtin._is_public_url = lambda u: "127.0.0.1" not in u
    try:
        with pytest.raises(builtin.FetchBlocked):
            asyncio.run(builtin.fetch_public("https://public.example/r", transport=httpx.MockTransport(handler)))
    finally:
        builtin._is_public_url = orig


def test_spa_serving_blocks_traversal(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from rewoo.api import app as app_mod
    from rewoo.config import Config
    from rewoo.core import ReWoo
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>SPA</html>")
    (dist / "assets" / "a.js").write_text("ok")
    (tmp_path / "secret.js").write_text("TOP SECRET")
    monkeypatch.setattr(app_mod, "WEB_DIST", dist)
    rw = ReWoo(Config(data_dir=tmp_path / "d"), db_path=str(tmp_path / "d.db"), bootstrap_env=False)
    try:
        with TestClient(app_mod.create_app(rw, run_background=False)) as c:
            assert c.get("/assets/a.js").text == "ok"
            assert "SPA" in c.get("/bots/woo").text
            assert "TOP SECRET" not in c.get("/..%2Fsecret.js").text
            assert "TOP SECRET" not in c.get("/%2e%2e/secret.js").text
            assert c.get("/api/nope").status_code == 404
    finally:
        rw.close()


def test_access_token_guard(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from rewoo.api.app import create_app
    from rewoo.config import Config
    from rewoo.core import ReWoo
    monkeypatch.setenv("REWOO_ACCESS_TOKEN", "letmein")
    rw = ReWoo(Config(data_dir=tmp_path), db_path=str(tmp_path / "g.db"), bootstrap_env=False)
    try:
        with TestClient(create_app(rw, run_background=False)) as c:
            assert c.get("/api/health").status_code == 200
            assert c.get("/api/overview").status_code == 401
            assert c.get("/api/overview", headers={"Authorization": "Bearer letmein"}).status_code == 200
            assert c.post("/api/auth", json={"token": "letmein"}).status_code == 200
            assert c.get("/api/overview").status_code == 200  # cookie set
    finally:
        rw.close()


def test_pdf_reader_fallback_hint():
    from rewoo.memory.text import extraction_hint, pdf_reader_class
    hint = extraction_hint("scan.pdf")
    assert ("pypdf" in hint) if pdf_reader_class() is None else ("text layer" in hint)


def test_board_and_threads_api(client):
    t = client.post("/api/threads", json={"message": "Remind me to stretch", "bot_id": "tally"}).json()
    wait_done(client, t["task"]["id"])
    thread = client.get(f"/api/threads/{t['thread_id']}").json()
    assert thread["turns"][0]["events"] and thread["thread"]["bot_id"] == "tally"
    follow = client.post(f"/api/threads/{t['thread_id']}/messages", json={"message": "Remind me to drink water"}).json()
    wait_done(client, follow["task"]["id"])
    assert len(client.get(f"/api/threads/{t['thread_id']}").json()["turns"]) == 2
    board = client.get("/api/board").json()
    assert {b["id"] for b in board["bots"]} >= {"woo", "scout", "quill", "tally", "hush"}
    assert client.delete(f"/api/threads/{t['thread_id']}").json()["ok"]
    assert client.get(f"/api/threads/{t['thread_id']}").status_code == 404


def test_v1_unwraps_gateway_context_blocks(client, rw):
    """OpenClaw appends a machine context block as the *last* user message; the real request comes earlier."""
    h = {"Authorization": f"Bearer {rw.store.get_setting('api_key')}"}
    msgs = [
        {"role": "system", "content": "You are a personal assistant running inside OpenClaw."},
        {"role": "user", "content": "[Fri 2026-09-25 16:33 GMT+6] Calculate 7 * 8\n\nRuntime: agent=main | session=s | host=h | model=rewoo/woo"},
        {"role": "user", "content": "<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>\nActive exec sessions: none\n<<<END_OPENCLAW_INTERNAL_CONTEXT>>>"},
    ]
    r = client.post("/v1/chat/completions", headers=h, json={"model": "rewoo", "messages": msgs})
    assert r.status_code == 200, r.text
    assert "56" in r.json()["choices"][0]["message"]["content"]
    task = rw.store.get("tasks", r.json()["rewoo"]["task_id"])
    assert task["title"] == "Calculate 7 * 8"
    assert "Active exec sessions" in task["prompt"]  # kept as calling-app context, not lost
    only_ctx = [{"role": "user", "content": "<<<BEGIN_X>>>data<<<END_X>>>"}]
    assert client.post("/v1/chat/completions", headers=h, json={"model": "rewoo", "messages": only_ctx}).status_code == 400


def test_paperclip_issue_create_and_list(rw):
    seen = []

    def handler(request):
        seen.append((request.method, request.url.path, json.loads(request.content) if request.content else None))
        if request.method == "POST":
            return httpx.Response(201, json={"id": "iss1", "title": "Do it"})
        return httpx.Response(200, json=[{"id": "iss1", "title": "Do it", "status": "todo"}])

    rw.engines.transport = httpx.MockTransport(handler)
    rw.engines.save_config("paperclip", {"base_url": "http://pc:3100", "company_id": "c1"})
    from rewoo.engines.paperclip import PaperclipClient
    pc = PaperclipClient(rw.engines)
    assert asyncio.run(pc.create_issue("Do it", "details", "agt1"))["id"] == "iss1"
    assert asyncio.run(pc.issues())[0]["status"] == "todo"
    assert seen[0] == ("POST", "/api/companies/c1/issues", {"title": "Do it", "description": "details", "assigneeAgentId": "agt1"})


def test_paperclip_heartbeat_reports_back_and_skips_closed(client, rw):
    state = {"status": "todo", "comments": []}

    def handler(request):
        path = request.url.path
        if request.method == "GET" and path == "/api/issues/iss9":
            return httpx.Response(200, json={"id": "iss9", "status": state["status"]})
        if request.method == "POST" and path == "/api/issues/iss9/comments":
            state["comments"].append(json.loads(request.content)["body"])
            return httpx.Response(201, json={"id": "c1"})
        if request.method == "PATCH" and path == "/api/issues/iss9":
            state["status"] = json.loads(request.content)["status"]
            return httpx.Response(200, json={"id": "iss9", "status": state["status"]})
        return httpx.Response(404, json={})

    rw.engines.transport = httpx.MockTransport(handler)
    client.put("/api/engines/paperclip", json={"webhook_secret": "s", "base_url": "http://pc:3100", "company_id": "c1"})
    payload = {"agentId": "a1", "runId": "r1", "rewooBot": "tally",
               "context": {"issueId": "iss9", "wakeReason": "issue_assigned",
                           "paperclipIssue": {"id": "iss9", "identifier": "TES-9", "title": "Calculate 3 * 3", "description": "quick"}}}
    r = client.post("/api/paperclip/heartbeat", json=payload, headers={"X-ReWoo-Secret": "s"})
    task = wait_done(client, r.json()["task_id"])
    assert task["title"] == "Calculate 3 * 3" and "9" in task["result"]
    for _ in range(100):
        if state["status"] == "done":
            break
        time.sleep(0.05)
    assert state["status"] == "done" and "Tally (ReWoo)" in state["comments"][0]
    again = client.post("/api/paperclip/heartbeat", json=payload, headers={"X-ReWoo-Secret": "s"}).json()
    assert again.get("skipped") == "issue already closed" and len(state["comments"]) == 1
