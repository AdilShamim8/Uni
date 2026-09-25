# ReWoo architecture (v0.2)

ReWoo is one Python process: a FastAPI server that owns a SQLite database and serves a prebuilt web app (source in `web/`, React + TypeScript). There is no queue and no vector database server, and end users need no Node. A personal OS should install like an app.

```
                         ┌───────────────────────── Web app (rewoo/web) ─────────────────────────┐
                         │  Home · Live task · Memory · Helpers · Library · Settings · Onboarding │
                         └───────────────▲──────────────────────────────┬─────────────────────────┘
                              SSE events │                              │ REST (JSON)
┌────────────────────────────────────────┴──────────────────────────────▼────────────────────────┐
│ api/app.py  (FastAPI)                                                                           │
├──────────────┬────────────────────┬──────────────────────┬───────────────────┬─────────────────┤
│ agent/       │ memory/            │ models/              │ tools/            │ connectors/     │
│ runtime.py   │ store.py (Memory)  │ base.py (interface)  │ registry.py       │ gdrive.py       │
│ protocol.py  │ context.py         │ adapters.py          │ builtin.py        │                 │
│ helpers.py   │ text.py            │ router.py · demo.py  │                   │                 │
├──────────────┴────────────────────┴──────────────────────┴───────────────────┴─────────────────┤
│ events.py (EventBus: persist + fan-out)            db.py (SQLite + FTS5)       harness/ (evals) │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 1. The task lifecycle

```
POST /api/tasks ─▶ create_task (status=queued) ─▶ runtime.start ─▶ run()
   run():
     primary brain chosen (router.primary(profile)) → remote? (affects privacy + redaction)
     _loop(helper, prompt, depth=0):
        ContextBuilder.build()  ─▶ event "context" (the receipt)
        system prompt = helper persona + portable protocol + tool signatures
        repeat ≤ max_steps:
           router.complete()     ─▶ events "usage", maybe "brain_switch"
           parse_action()        ─▶ one repair attempt on malformed JSON
           "plan" / "thought" events
           answer? → return
           tool:  risk ∈ approval set? → event "approval_requested", await human
                  run with timeout      → "tool_started" / "tool_finished" (+ "context_update")
                  observation appended to the conversation
     → "answer" (with the citations actually used) → episode saved to memory → "done"
   errors: BudgetExceeded → "stopped" · Cancelled → "cancelled" · ProviderError/other → "error"
   startup: runtime.recover() marks queued/running/waiting tasks as "interrupted"
```

Every event is written to the `events` table **and** pushed to live subscribers. The UI is a pure function of this event stream, so a task page opened later replays exactly what happened (`python -m rewoo trace <id>` does the same in the terminal). This separation of state stream from rendering surface is one of the strongest patterns in the "visual office" projects we studied.

## 2. The portable agent protocol (`agent/protocol.py`)

Each vendor's native function-calling format is different, and many local models don't support it at all. ReWoo asks every model for **one JSON object per turn**:

```json
{"thought": "one friendly sentence", "plan": ["optional", "first turn"], "tool": "search_memory", "input": {"query": "lease pets"}}
{"thought": "…", "answer": "Markdown answer with [1] citations"}
```

The parser tolerates code fences, chatter around the JSON, trailing commas and `final`/`args` aliases. If parsing fails, the model gets one repair prompt. After that, the raw text becomes the answer, so weak models degrade gracefully instead of crashing.

## 3. Model layer (`models/`)

- `ModelProvider.complete(messages, system, …) → Completion(text, tokens, cost)` is the whole contract. `embed()` is optional.
- Adapters: `OpenAICompatProvider` (OpenAI, OpenRouter, Groq, Together, vLLM, LM Studio, llama.cpp…), `AnthropicProvider`, `GeminiProvider`, `OllamaProvider`, and `DemoProvider` (offline, deterministic, rule-based: it powers first-run and CI).
- `ProviderSpec` is stored in settings (editable in the UI). Keys stay in the local DB, and the API only exposes `key_hint`.
- `Router.chain(profile, local_only)`: default brain → user-chosen backups. `profile="private"` or `local_only=True` filters to `spec.local` providers. Retryable errors (network, 408/409/429/5xx) fall through to the next brain and emit `brain_switch`.

## 4. Memory and context engineering (`memory/`)

**Layers.** *Facts* (short, user-approved), *Knowledge* (documents from uploads, Drive and notes), *Episodes* (past Q&A, stored automatically unless memory is paused), and *Working context* (built fresh per task).

**Indexing.** Text is extracted (PDF via pypdf, DOCX via zip/XML, HTML, CSV, text), chunked on paragraph boundaries (~900 chars with overlap), stored in `chunks`, indexed in an FTS5 virtual table, and embedded. By default ReWoo uses a local feature-hashing embedder (words plus character trigrams, 256-d), which needs no network and no model download. A provider embedding model can be used instead (`embedder` setting).

**Retrieval.** BM25 keyword ranking (FTS5, title weighted ×2) and cosine similarity are fused with Reciprocal Rank Fusion, with at most 2 chunks per document for diversity. **Only enabled sources are queried.** Disabled sources are invisible, not filtered after the fact.

**ContextBuilder** turns candidates into a `ContextPack`:
1. relevant and pinned facts first, then retrieved chunks;
2. private chunks are dropped when the brain is remote, with the reason recorded;
3. secrets are redacted when the brain is remote (`text.redact`);
4. items are greedily packed into `context_tokens` (the last item may be trimmed);
5. the result is numbered for citation, and the receipt lists `used`, `left_out` (with reasons), `secrets_hidden`, `used_tokens` and `contains_private`.

If a private item is included (on-device brain), `RunState.local_only` becomes true for the rest of the task, so a fallback can never leak it to a remote brain.

## 5. Tools and consent (`tools/`)

A tool is an async function plus `risk ∈ {safe, external, memory, irreversible}`. The approval mode maps risks to "ask first":

| Mode | Asks before |
|---|---|
| Careful | external, memory, irreversible |
| Balanced (default) | memory, irreversible |
| Autopilot | irreversible |

Built-ins: `search_memory`, `read_document`, `remember_fact` (memory), `calculator` (AST-safe), `current_time`, `web_fetch` (external, SSRF-guarded), `save_note`, `add_todo`, `list_todos`, `draft_email` (draft-only), and `ask_helper` (delegation, max depth 1). Tool failures and timeouts become observations the model can react to. They never crash the task.

## 6. Helpers and recipes

Helpers are rows in `helpers`: persona instructions, a tool allow-list and a privacy profile. **Hush** uses `profile="private"`, so it can only run on local brains. Delegation (`ask_helper`) runs a nested loop with the same budgets and citations, and its events carry `depth=1` so the UI indents them.

Recipes are JSON templates (`recipes/*.json`, plus `data/recipes/*.json` for your own) that render a prompt from a few form fields and choose a helper.

## 7. Google Drive (`connectors/gdrive.py`)

OAuth 2.0 web flow with the `drive.readonly` scope, `access_type=offline`, and state checking. Tokens live in settings and refresh automatically. Sync walks only the chosen folders (recursion depth ≤ 5), exports Google Docs and Slides to text and Sheets to CSV, downloads supported files up to 15 MB, skips unchanged files by `modifiedTime`, dedupes by content hash, and removes documents whose files disappeared. It uses plain REST over httpx (no Google SDK), so the whole flow is tested with a mock transport.

## 8. Evaluation harness (`harness/`)

Scenarios are JSON (setup → prompt → expectations). `run_scenario` builds an isolated ReWoo in a temp dir, auto-answers approvals as the scenario specifies, and grades the event log: status, tools used or not used, answer content, citations, step count, facts saved, to-dos and drafts, private-data leakage, secrets hidden, and number of approvals. The default suite encodes ReWoo's product promises as tests.

## 9. Data model (SQLite)

`settings`, `tasks`, `events`, `sources`, `documents`, `chunks` + `chunks_fts`, `facts`, `helpers`, `notes`, `todos`, `drafts`, `approvals`. Everything lives in one file, and you can back it up by copying `data/`.

## 10. Known limits (v0.1)

- Vector search is brute force. That's fine for personal-scale corpora (tens of thousands of chunks), but not for millions.
- The local embedder is lexical-semantic, not truly semantic. Configure a provider embedding model for better recall.
- There's a single user and no auth. Bind to `127.0.0.1` (the default). Don't expose it to the internet without a reverse proxy and authentication.
- Approvals wait while the server runs. After a restart, pending approvals expire and tasks are marked interrupted.


---

# v0.2 additions

```
                ┌─────────── Web app (web/ → rewoo/web/dist) ───────────┐
                │ Home/Team · Chat + Computer panel · Routines · Skills  │
                │ Memory · Connections · Library · Settings              │
                └───────▲──────────────────────────────┬─────────────────┘
          SSE: /api/stream (board), /api/tasks/{id}/stream   REST
┌───────────────────────┴──────────────────────────────▼───────────────────────────────┐
│ api/ routes_core · routes_memory · routes_team · openai_api (/v1)                    │
├──────────────┬─────────────┬──────────────┬──────────────┬────────────┬──────────────┤
│ agent/       │ agent/      │ agent/       │ engines/     │ channels/  │ scheduler    │
│ runtime      │ threads     │ skills       │ hub          │ telegram   │ (routines)   │
│ protocol     │ helpers=Bots│ (SKILL.md)   │ paperclip    │ manager    │ heartbeats   │
└──────────────┴─────────────┴──────────────┴──────────────┴────────────┴──────────────┘
```

## 11. Bots, threads and hand-offs
Bots are rows in `helpers` (kept for compatibility), with `job`, `engine` and `engine_config`. A **thread**
groups tasks. `Threads.history_block()` puts the last 6 finished turns (capped at 3,000 chars) into the next task's
prompt. The composer's `@bot` mention routes a message to another Bot in the same thread, and the `ask_helper`
tool delegates mid-task (a `handoff` event is shown in the UI). `EventBus.activity` is an in-memory board of what
each Bot is doing, fed by events and exposed by `/api/board` plus the global `/api/stream`.

## 12. Streaming
`ModelProvider.stream(messages, on_delta)` has native implementations for OpenAI-compatible APIs (SSE),
Anthropic (SSE `content_block_delta`) and Ollama (NDJSON). Everything else falls back to one delta.
`Router.stream` only falls back to the next brain if the failing one hasn't produced text yet, so two
answers are never mixed. Because the model replies in the JSON protocol, `AnswerStream` incrementally
decodes the `"answer"` string (escapes split across chunks, `\uXXXX`, plain-prose fallback) and the runtime
emits `answer_delta`. If the model turns out to call a tool instead, `answer_reset` clears the partial text.

## 13. Skills (learning loop)
After a successful task with at least 2 distinct tool calls and no skill already used, `_maybe_propose_skill`
drafts a skill. Real brains write the SKILL.md via `SKILL_WRITER_PROMPT`; the Demo brain (or a failed LLM draft)
gets a deterministic draft built from the actual tool steps. The skill is stored as `proposed` and nothing is
used until you approve it. Active skills are matched per request (keyword overlap plus local-embedding
similarity), injected into the system prompt, and mirrored to `data/skills/<name>/SKILL.md`.
`Skills.import_dir()` reads any SKILL.md tree, including the vendored Hermes library.

## 14. Routines and scheduler
`routines.validate_schedule / next_run` support `manual`, `interval` (at least 5 min) and `daily` at a local
time on chosen days. `Scheduler` ticks every 20 s in the app's lifespan and starts due routines as normal tasks
(`origin=routine`, continuing the routine's own thread). **Teach a task**: `steps_from_events()` turns a
finished task's top-level tool steps into routine steps, and `build_prompt()` appends them as "Follow the
routine you were taught".

## 15. Engines
`EngineHub` stores per-engine config (secrets never returned), probes health, and runs turns:
- **hermes**: `api` mode uses the OpenAI-compatible client against Hermes' `api_server` (:8642). `cli` mode runs
  `hermes chat -q <request + context> -Q` and streams stdout.
- **openclaw**: the OpenAI-compatible client against the gateway (:18789) with `model = openclaw/<agent>`.
- **paperclip**: `POST /api/paperclip/heartbeat` accepts Paperclip's `http`-adapter payload
  (`{agentId, runId, context, …payloadTemplate}`), checks `X-ReWoo-Secret`, maps `rewooBot` to a Bot, keeps one
  thread per Paperclip agent and returns 202. `PaperclipClient` reads agents and cases and creates cases.

For engine Bots, ReWoo still builds the context pack (privacy rules apply, and engines count as remote unless
marked local), records a receipt, streams deltas and accounts usage.

## 16. OpenAI-compatible API
`/v1/chat/completions` authenticates with the ReWoo API key, resolves `model` to a Bot, and extracts the
real request with `_clean()`. That function moves `<<<BEGIN_…>>>…<<<END_…>>>` blocks, runtime metadata lines and
timestamp prefixes into "calling-app context". The latest user message with real content becomes the request.
The endpoint subscribes to the task's events *before* starting it, then either streams `answer_delta` as
`chat.completion.chunk` or returns one completion. `user` / `X-ReWoo-Thread` keep one conversation per caller.

## 17. Channels
`ChannelManager` starts enabled connectors in the lifespan. `TelegramChannel` long-polls `getUpdates`
(HTTPS, works behind NAT) and answers only paired chats (`/start <code>`). It maps each chat to a thread and a
Bot (`/bot <id>`, `/new`), and relays approvals as inline buttons that call `runtime.decide()`.

## 18. Reliability fixes in v0.2
Covered by `tests/test_v2.py`: store close (Windows), synchronous event subscription, atomic event
sequence numbers, thread-safe fan-out, SSRF on redirects, SPA traversal, OAuth state TTL, SSE disconnect
detection within 1 s, float32 vector cache, lifespan startup, UTF-8 console.
