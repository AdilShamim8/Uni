# Changelog

## 0.4.0 · 2026-10-16 · "Local Mode + a workspace that feels finished"

### Added
- **Local Mode — the app now works on any deployment, configured or not.** When `/api/health` reports `setupRequired`, the landing page offers "Start chatting — no signup": the full workspace runs with conversations, provider keys, and settings persisted in the browser (`localStorage`, capped at 200 conversations, cross-tab synced). Returning local users go straight back to their workspace on reload. The setup guide remains one click away (landing link, sidebar banner, Settings).
  - `POST /api/chat/direct` — stateless streaming chat proxy with a per-request key: no database, no session, key never persisted/logged/echoed, IP rate-limited (20/min), strict input validation (≤60 messages, 32k/message, 200k total).
  - `POST /api/models/direct` — live model discovery with a per-request key (10/min IP-limited).
  - Client-side demo brain streams through the same SSE event protocol, so the UI code path is identical in both modes.
- **Chat UX overhaul** (interaction patterns from Open WebUI / LibreChat / LobeChat, reimplemented in React):
  - Markdown: GFM tables/strikethrough/task lists; code blocks with language label, one-click copy, and syntax highlighting (`rehype-highlight` + custom light/dark token themes).
  - Message actions: copy (user + assistant), regenerate with **single persistence** (new `DELETE /api/messages/[id]` removes the replaced turn instead of stacking duplicates), timestamps, model + token meta, demo badge.
  - Empty state with four suggestion cards; auto-scroll with detach detection and a scroll-to-bottom pill; auto-growing composer (Enter to send, Shift+Enter for newline) with a Stop button while streaming.
  - Sidebar: conversation search, date groups (Pinned / Today / Yesterday / Previous 7 days / Previous 30 days / Older), inline rename, pin, and delete with hover actions.
  - Model picker popover: provider sections, lazy live discovery, search, clearly-labeled offline fallback lists, demo-brain entry.
- **Theme system**: light / dark / system via `next-themes`; toggle in the sidebar and Appearance tab in Settings.
- **Keyboard shortcuts**: `⌘/Ctrl+K` new conversation, `⌘/Ctrl+B` toggle sidebar.
- **Original brand identity**: new ReWoo mark (gradient badge, geometric workflow-stroke "R", concentric reasoning orbit + agent node) replacing the placeholder logo; favicon.ico (16/32/48), app icon, apple-touch-icon, and a 1200×630 social card; full OpenGraph/Twitter metadata.
- `DELETE /api/messages/[id]` (cloud mode) — tenant-scoped single-message deletion.

### Changed
- Boot flow: a `setupRequired` deployment no longer walls the app behind the setup screen; the landing page adapts (local-mode CTA, setup link preserved). The setup screen gains a "Back to ReWoo" affordance when reachable from the app.
- Landing page rebuilt: gradient hero, feature grid, product mock, local-mode-aware CTAs, credits footer.
- Demo brain response now showcases the full rendering pipeline (table + syntax-highlighted code block) in both server and local variants.

### Fixed
- Code-block background emitted invalid CSS under Tailwind v4 (`bg-[--code-bg]` → `background-color:--code-bg`); now `bg-[var(--code-bg)]` (verified in the compiled bundle).
- Language label on code blocks always showed "text" — the `language-xxx` class lives on the `<code>` child (set by rehype-highlight), not on `<pre>`; both are now checked.
- `react-hooks` v6 rule violations (`set-state-in-effect`, `immutability`): viewport detection and the mounted check now use `useSyncExternalStore`; `streamMeta` is mirrored to a ref on event arrival instead of in an effect.

### Verified (production build, headless browser, both modes)
- Cloud: signup → demo-brain chat → persistence + auto-title → reload → regenerate (exactly one assistant row) → dark/light screenshots (VLM QA 8–9/10).
- Local (setupRequired server): landing CTA → workspace → demo chat → localStorage persistence (conversation + 2 messages) → reload returns to workspace → key add with real provider validation → model picker offline fallback → provider error surfacing (403) → sidebar search + date groups.
- Gates: `eslint` clean, `tsc --noEmit` clean, `bun test` 40/40, `next build` clean.

---

## 0.3.1 · 2026-10-16 · "Fail loudly, guide precisely"

### Fixed
- **(D22, High) Silent misconfiguration mode on hosted deployments.** A Vercel deploy without `DATABASE_URL` generated the SQLite client and then failed every database call on the read-only serverless filesystem — sign-up/sign-in returned opaque `500 "Try again"` with nothing telling the operator what to do. Now:
  - `/api/health` probes a real table and returns precise, safe diagnostics (`dbIssue`: `not-configured` / `serverless-sqlite` / `unreachable` / `schema-missing`, plus `masterKey: env|file|ephemeral`), with HTTP 503 when setup is required.
  - Every database-backed API route returns `503 {"code":"setup_required", issue, error}` for infrastructure failures instead of a generic 500 — application errors keep their existing handling.
  - The client boots into a dedicated **Setup required** screen: what is missing, why it matters, copy-paste commands, provider links, and a "Check again" button. Verified in light/dark via headless browser + VLM review.
  - `scripts/prisma.mjs` prints explicit build-time warnings on Vercel for a missing/SQLite `DATABASE_URL` or a missing `REWOO_MASTER_KEY`.
- **(D23, Medium) Duplicated assistant message when the client disconnects mid-stream.** Pressing Stop (or any disconnect) right as a turn completed caused the response to be persisted twice — once by the normal flow and once by the interrupt handler. Verified fixed with an aborting-stream regression check.
- **(D24, Low) API error handlers rethrew non-auth errors**, producing Next.js HTML 500 pages instead of JSON — the client could only show "Request failed (500)". All `guard()`s now return structured JSON and log with route tags.

### Added
- **Setup diagnostics module** (`src/lib/setup.ts`) — pure, unit-tested error classification (9 new bun:test cases; suite now 40) shared by health, routes, and the client.
- **True zero-setup local development.** No `.env` copy and no manual `db:push`: `bun install` auto-provisions `prisma/db/rewoo.db` (fresh clones only; existing databases are never touched), and the runtime defaults to the same absolute SQLite path so CLI and client always agree.
- `crypto.masterKeySource()` reporting where the vault key was resolved from (`env` / `file` / `ephemeral`) — used by health, never exposes key material.
- `ApiError` in the client layer carrying HTTP status + machine-readable `code`.
- Deployment troubleshooting table mapping every `dbIssue` to its fix (docs/DEPLOYMENT.md).

## 0.3.0 · 2026-10-16 · "One product, production layout"

The repository becomes the ReWoo workspace: the legacy Python app and vendored
engines are retired from mainline, the Next.js app is promoted to the root,
and the deployment story is Vercel-first. All changes owner-authorized and
recorded in `docs/DECISIONS.md` (ADR-010…013).

### Removed
- **`engines/`** — 73,538 vendored files (~1.1 GB: openclaw, hermes-agent, paperclip). Not imported by the workspace; 99.6% of repository files (D4). Recoverable from git history.
- **Legacy Python application** — `rewoo/`, `web/`, `tests/`, `examples/`, `scripts/`, and Python packaging configs. Its model layer duplicated the workspace BYOK gateway (ADR-001 superseded). Remains in history for self-hosters.
- **~40 unused dependencies and 39 of 46 vendored UI components** — clean install drops 827 → 524 packages (D17).

### Changed
- **Single-app repository at the root** (formerly `you/`) — the layout production Next.js products use; Vercel import works with zero configuration (D16).
- **Session cookie renamed** `you_session` → `rewoo_session` (completes ADR-009; one-time sign-out for existing sessions).
- One CI workflow: install → generate → lint → typecheck → test → build.

### Added
- **Vercel-ready data layer** — dual Prisma schemas (PostgreSQL production default with the `rhel-openssl-3.0.x` binary target; SQLite zero-setup dev), auto-selected by `DATABASE_URL` protocol via `scripts/prisma.mjs` (wired into `postinstall` and `db:*` scripts).
- **Streaming-safe route limits** — `maxDuration` 60s (chat) / 30s (model discovery, credential validation).
- **Resilient model gateway** — connect timeout + bounded retries with backoff on transient failures (408/409/429/5xx); user cancels are never retried; started streams are never retried.
- **Model tier guidance** — live catalogs sorted flagship-first; *fast & affordable* vs *flagship* badges in the Models view; refreshed fallback catalogs.
- **Rate limiting** — sign-in 10/min/IP, sign-up 5/min/IP, chat 30/min/user, credential creation 10/min/user (429 + `Retry-After`).
- **Automated test suite (D18)** — 31 bun:test cases: AES-256-GCM vault round-trips and tamper detection, scrypt auth, rate-limit windows, provider registry and tier heuristic, and two-user tenant isolation against a real throwaway database.
- **Documentation for the new shape** — rewritten README, ARCHITECTURE, DEPLOYMENT (Vercel + self-host), SECURITY, CONTRIBUTING; consolidated decision records.

### Fixed
- **Model tier classification bug** (found by the new test suite): every Gemini model was classified *fast* because `geMINI` contains `mini` — now boundary-aware in both the gateway and the UI mirror.

## Unreleased · 2026-10-15 · "One name: ReWoo"

### Changed
- **Single product identity.** The multi-user workspace app is now branded **ReWoo** everywhere users can see it: page titles and metadata, wordmark, landing page, Settings, chat system prompt, provider attribution headers, health service label, package name, README, and CI naming. The "YOU" placeholder is retired (ADR-009).
- Internal renames with zero functional change: `you-client`/`you-store` libs, `components/you/`, `useYou` store hook, `you-*` CSS utilities and a11y ids → `rewoo-*` equivalents.

### Compatibility (self-hosters)
- `REWOO_MASTER_KEY` replaces `YOU_MASTER_KEY` — the old name still works, and a legacy `.you-master-key` dev file is migrated automatically. Vault KDF parameters are unchanged, so stored provider credentials keep decrypting.
- Dev database default in `.env.example` is now `./db/rewoo.db`; existing local `.env` files are unaffected.

### Added
- Phase Zero documentation completed: `docs/engineering/DEFECT_REGISTER.md`, `docs/engineering/REPOSITORY_CLEANUP_PLAN.md`, `docs/research/OPEN_SOURCE_REUSE_REGISTER.md` (license-verified reuse gate: LibreChat MIT and OpenMausBot Apache-2.0 approved; open-dot, open-dots, open-webui, lobehub barred from code reuse).
- ADR-009 (product identity) and ADR-010 (open-source reuse gate).

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
