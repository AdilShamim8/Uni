# Changelog

## 0.2.0 — 2026-09-25 · "AI teammates"

ReWoo becomes an *AI teammates* product, merging Paperclip, Hermes Agent and OpenClaw.

### Added
- **Bots**: persistent teammates with jobs, personalities, tools, privacy profiles, and a choice of **engine** (ReWoo, Hermes Agent, OpenClaw). There's a live activity board showing what every Bot is doing right now.
- **Threads**: real conversations. Follow-ups see recent turns, and several Bots can work in one thread (`@mention` hand-off, `ask_helper` delegation shown in the UI).
- **Streaming answers**: native token streaming for OpenAI-compatible APIs, Anthropic and Ollama, plus an incremental JSON extractor for the agent protocol.
- **Skills (Hermes-style learning loop)**: Bots propose reusable `SKILL.md` skills after multi-step work, and you approve them. Skills are matched to future requests and usage is counted. Import the 208 skills bundled with Hermes Agent.
- **Routines (Paperclip-style heartbeats)**: schedule any request (interval, or daily at a time on chosen days). **Teach a task**: *Save as routine* captures the steps a Bot took.
- **OpenAI-compatible API** (`/v1/models`, `/v1/chat/completions`, streaming): any app, including Hermes and OpenClaw, can use ReWoo Bots. It handles gateway-wrapped messages (context blocks, metadata, timestamps).
- **Engines**: Hermes (API server or CLI), OpenClaw (gateway), Paperclip (`http`-adapter webhook plus REST client: issues are worked, commented on and closed automatically). The full upstream sources are vendored in `engines/`. All integrations were verified live.
- **Telegram channel** with pairing codes and inline Allow / Not now approval buttons.
- **New web app**: React + TypeScript + Vite + Framer Motion, with Night (aurora and glass) and Day themes, animated Bot orb avatars, a live "Computer" panel, and full mobile support. It ships prebuilt.
- Optional `REWOO_ACCESS_TOKEN` guard, security headers, `SECURITY.md`.
- 131 backend tests (up from 96), 3 UI unit tests, and CI on Windows, macOS and Linux across Python 3.9 and 3.12.

### Fixed (from the v0.1 audit)
1. SQLite file locks on Windows: `Store.close()` and `ReWoo.close()`, and the harness closes before deleting temp dirs.
2. Approval-flow race on Python 3.11+: `auto_approver` subscribes synchronously and answers approvals that are already pending.
3. Windows console `UnicodeEncodeError`: UTF-8 stdout/stderr with replacement.
4. PDFs silently not indexed: `pypdf` → `PyPDF2` fallback, and users get a clear reason when extraction fails.
5. SSRF through HTTP redirects in `web_fetch`: every hop is re-validated and the body is capped.
6. Static-file path traversal: the SPA serves only resolved paths inside `dist/`.
7. Non-atomic event sequence numbers: allocation and insert happen under one lock.
8. Thread-unsafe `Queue.put_nowait`: delivery goes through the owning loop (`call_soon_threadsafe`).
9. Unbounded OAuth state growth: TTL plus a size-capped store.
10. Leaked modal key listeners: the new UI registers one listener and cleans it up.
11. Slow SSE disconnect detection: the connection is checked every second.
12. O(N) JSON embedding parsing: float32 BLOB vectors with an in-process cache. Also: `lifespan` replaces `on_event`, and `get_running_loop()` replaces `get_event_loop()`.

## 0.1.0 — 2026-09-25
First release: personal agent OS with private memory, context receipts, consent gates, model router, Google Drive, eval harness.
