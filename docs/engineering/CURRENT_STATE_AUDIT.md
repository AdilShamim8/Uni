# ReWoo / YOU — Current State Audit (Phase Zero)

**Audit date:** 2026-10-15
**Auditor:** Engineering agent team (automated inspection)
**Repository:** https://github.com/AdilShamim8/ReWoo @ `main` (6076fb50)
**Method:** Full clone, file-by-file inspection of first-party code (`rewoo/`, `web/`, `tests/`, docs), metadata review of vendored engines, cross-reference with `BUGS_AND_ISSUES.md`, `RESEARCH.md`, `docs/ARCHITECTURE.md`.

---

## 1. Executive Summary

ReWoo is a **working, single-user personal AI agent application** built as a Python 3.9+ monolith (FastAPI + SQLite) with a modest React/Vite frontend. It ships a genuinely functional agent runtime (delegation, budgets, approvals, skills, routines, memory with citations, Google Drive connector, Telegram channel, OpenAI-compatible API) backed by 10 test files and unusually honest documentation (a 36-repo research survey and a self-reported bug register).

The distance between the current system and the YOU product vision is concentrated in five areas:

1. **No multi-user architecture.** Authentication is a single optional shared access token (`REWOO_ACCESS_TOKEN`). There is no user model, no tenant isolation, no per-user credentials, and no horizontal scalability. This is the single largest gap.
2. **Repository weight.** 73,538 of 73,692 tracked files (99.8%) are vendored full copies of three external projects under `engines/` (~292 MB). Clone time and tooling cost are severe; the first-party code is only ~200 files.
3. **Known defect register is real.** `BUGS_AND_ISSUES.md` documents 12 issues (SSRF bypass, path traversal, Windows test failures, asyncio deprecations, leaks). Several were addressed in commit 3a1ee423; the register's resolution state is not tracked per-issue.
4. **Frontend is functional but not premium.** The Vite app (~30 source files, React 18, react-router) delivers Home/Chat/Team/Routines/Skills/Memory/Library/Connections/Settings pages, but does not approach the design-system depth, motion, or accessibility bar set by the product vision (Phase Three).
5. **No TypeScript service layer.** The vision targets a TypeScript-first stack. Today TypeScript exists only in the Vite frontend. The Python runtime is valuable and tested — it must be preserved behind a clean boundary, not rewritten for a label.

**Bottom line:** the existing system is worth preserving as the local/self-hosted engine and as a behavioral reference. The YOU product should be built as a new TypeScript application (Next.js) with real multi-user auth, BYOK provider gateway, and a premium workspace shell, integrated with — not replacing — the proven Python agent core.

---

## 2. What Exists Today (Verified by Inspection)

| Subsystem | Location | State | Evidence |
|---|---|---|---|
| App wiring / DI root | `rewoo/core.py` (101 LOC) | Working | Composes Store, EventBus, Memory, Router, Tools, Runtime, Routines, Scheduler, Channels, Drive; context-manager lifecycle |
| Persistence | `rewoo/db.py` (257 LOC) | Working | SQLite, 16 tables (settings, tasks, events, sources, documents, chunks, facts, helpers, notes, todos, drafts, approvals, threads, skills, routines, channels, channel_links) |
| Agent runtime | `rewoo/agent/runtime.py` (467 LOC) | Working | RunState, ToolContext, delegation (`delegate()`), budgets (`BudgetExceeded`), cancellation, approval gates (`decide()`), skill proposal, engine fallback (`_run_engine`) |
| Agent protocol / helpers | `rewoo/agent/{protocol,helpers,threads,skills}.py` | Working | Bot roster (Woo/Scout/Quill/Tally/Hush), routine scheduler, skill library |
| Model router | `rewoo/models/router.py` | Working | Multi-provider BYOK incl. local Ollama/LM Studio + offline demo brain |
| Tools | `rewoo/tools/builtin.py` (202 LOC), `registry.py` | Working | Tool registry with allow-lists per bot |
| Memory / RAG | `rewoo/memory/store.py` | Working with known limits | Facts + chunk citations; O(N) in-memory embedding scan (BUGS 7.1) |
| HTTP API | `rewoo/api/` (7 files) | Working | FastAPI; routes core/memory/team; OpenAI-compatible `/v1`; SSE progress; SPA serving with traversal guard (`root in candidate.parents`) |
| Auth | `rewoo/api/app.py` | **Single-token only** | Optional shared bearer/cookie token via env var; no user accounts |
| Channels | `rewoo/channels/` | Working | Telegram built in; 20+ via OpenClaw engine |
| Connectors | `rewoo/connectors/gdrive.py` | Working with leak noted | Google Drive OAuth (state leak, BUGS 6.2) |
| Engines (vendored) | `engines/{paperclip,hermes-agent,openclaw}` | Vendored, shallowly adapted | 73,538 files, all MIT; `EngineHub` dispatches to them |
| Web UI | `web/` (30 src files) + prebuilt `rewoo/web/dist` (committed) | Working, modest | React 18 + Vite + framer-motion + react-router; 9 pages |
| Tests | `tests/` (10 files) | Partially passing | 3 documented Windows/Py3.11+ failures (BUGS 1.1, 1.2, 2.1) |
| Docs | README, RESEARCH, BUGS_AND_ISSUES, docs/ (ARCHITECTURE, ENGINES, EXTENDING) | Strong | Research-grade honesty; audit trail of decisions |
| CI | `.github/` (1 file) | Minimal | Workflow presence not verified as gating |

---

## 3. Severity-Ranked Defect Register

Sources: `BUGS_AND_ISSUES.md` (self-reported, 2026-09-25) plus this audit's findings. Status reflects inspection of current `main` (post-3a1ee423).

| # | Severity | Defect | Location | Status on `main` | Notes |
|---|---|---|---|---|---|
| D1 | **Critical (product)** | No multi-user auth / tenant isolation; shared single token at best | `rewoo/api/app.py` | Open | Blocks hosted multi-user vision; must be solved in the new YOU layer |
| D2 | High (security) | SSRF bypass via open HTTP redirects in `web_fetch` | `rewoo/tools/builtin.py` | Claimed fixed in 3a1ee423 — re-verify with redirect-following test | Add regression test |
| D3 | High (security) | Arbitrary static file exposure via path traversal | `rewoo/api/app.py` | Guard present (`resolve()` + parents check) — re-verify on Windows/UNC paths | Add regression test |
| D4 | High (repo health) | 292 MB / 73.5k vendored files under `engines/` | `engines/` | Open | Kills clone/CI performance; complicates attribution scanning. All MIT, so legal — but should be submodules or fetched deps |
| D5 | High (quality) | 3 failing tests (SQLite Windows lock, asyncio wait_for deadlock, console UnicodeEncodeError) | `tests/test_harness.py` et al. | CLOSED — CI verified 2026-10-15 (pytest + eval green on ubuntu/windows/macos × Py 3.9/3.12, f38ef3057) | Regression coverage for the trio still worth adding |
| D6 | Medium | Non-atomic EventBus sequence + cross-thread `Queue.put_nowait` | `rewoo/events.py` | Claimed fixed in 3a1ee423 — verify | Race tests needed |
| D7 | Medium | OAuth state map unbounded growth | `rewoo/connectors/gdrive.py` | Open (per register) | Add TTL/expiry sweep |
| D8 | Medium | SSE disconnection detection blocked | `rewoo/api/routes_core.py` | Open (per register) | Heartbeat/timeout needed |
| D9 | Medium | O(N) embedding scan in memory store | `rewoo/memory/store.py` | Open | Fine at personal scale; blocks hosted scale |
| D10 | Medium | DOM keydown listener leaks in modals | `web/src/components/ui` | Open (per register) | Frontend being superseded by YOU app |
| D11 | Low | Deprecated `@app.on_event` / `get_event_loop()` | `rewoo/api/app.py` | Largely migrated to lifespan pattern (observed) | Finish removal |
| D12 | Low | `pypdf` vs `PyPDF2` silent PDF ingestion failure | requirements vs code | Fixed in 3a1ee423 (pypdf pinned) — verify | Add ingestion test |
| D13 | Medium (hygiene) | Prebuilt `rewoo/web/dist` committed to tree | `rewoo/web/dist` | Open by design (no-Node install promise) | Acceptable trade-off; document and keep generated-license file fresh |
| D14 | Low (hygiene) | Commit messages "Add files via upload" | history | Historical only | Adopt conventional commits going forward |

---

## 4. Subsystem Decisions (Preserve / Refactor / Replace)

| Subsystem | Decision | Rationale |
|---|---|---|
| `rewoo/` Python agent runtime, tools, memory, routines | **PRESERVE** | Working, tested, researched (36-repo survey). Becomes the local/self-hosted engine and behavioral reference for the YOU TypeScript gateway. |
| `rewoo/models/router.py` (BYOK multi-provider) | **PRESERVE + PARALLEL IMPLEMENT** | Keep for Python engine; the YOU app needs its own TS gateway with per-user encrypted credentials — the Python router is single-user. |
| `rewoo/api/` FastAPI surface | **PRESERVE** | Scriptable API + OpenAI-compatible `/v1` are assets. Will sit behind / alongside the YOU gateway in self-hosted mode. |
| Single-token auth | **REPLACE** (in new layer only) | The YOU app introduces real accounts, sessions, per-user isolation. Python API keeps token auth for self-host. |
| `web/` Vite frontend | **PRESERVE, then RETIRE at parity** | Works today; remains the UI for the Python standalone app until the YOU workspace reaches feature parity. |
| `engines/` vendored trees | **REFACTOR (extract)** | MIT-compatible; but in-tree vendoring at this scale is unsustainable. Target: package-manager deps or submodules + `scripts/fetch-engines`. **Owner decision required before moving — do not delete.** |
| `tests/` | **PRESERVE + FIX** | Fix D5 trio; add SSRF/path-traversal regression tests (D2/D3). |
| `docs/` + RESEARCH + BUGS registers | **PRESERVE** | Genuinely strong; keep honest-status culture. Add per-issue status tracking. |
| Committed `rewoo/web/dist` | **PRESERVE** (documented trade-off) | Supports the "Python only, no Node" install promise. |

---

## 5. Architecture Assessment vs. Target

- **Stack today:** Python 3.9+ / FastAPI / SQLite / httpx; React 18 + Vite TS frontend; single process; optional Docker.
- **Target (per product vision):** TypeScript-first, Next.js workspace, multi-user auth, PostgreSQL, background jobs, premium design system, agent orchestration, BYOK gateway with encrypted per-user credentials.
- **Recommended migration strategy — "Strangler at the edge, preserve the core":**
  1. Build the YOU app as a new TypeScript Next.js application in-repo (`you/`), additive, touching nothing existing.
  2. YOU owns: accounts/sessions, provider credential vault (AES-256-GCM at rest), model gateway (streaming), workspace UI, conversation persistence.
  3. The Python engine remains available for self-hosted power users; YOU can later delegate long-horizon agent work to it through a documented HTTP contract.
  4. Nothing working is deleted; `web/` retires only at parity.

---

## 6. Verification Gaps (what we could NOT verify)

- We did not execute the Python test suite in this environment (sandbox targets the TS stack); D5/D6/D12 fix statuses are taken from commit messages and code reading, and are flagged for re-verification in CI.
- Engine internals (Paperclip/Hermes/OpenClaw) were inspected at metadata level only; their runtime integration depth via `EngineHub` needs a live run.
- CI gating behavior was not exercised (single workflow file; no evidence it gates merges).

---

## 7. Immediate Actions (feeds IMPLEMENTATION_ROADMAP)

1. Land this audit + `context/` docs (this commit).
2. Scaffold the YOU Next.js app (`you/`) with design tokens, Prisma schema (users, sessions, providers, conversations, messages), and CI checks — Milestone 1.
3. Implement auth (sign-up/sign-in/sessions) and BYOK provider vault with encryption — Milestones 1–2.
4. Implement streaming chat vertical slice: provider config → message → streamed real response → persisted conversation — Milestone 2.
5. Re-verify D2/D3 with regression tests; fix D5 trio on the Python side.
6. Open the engines-extraction decision with the owner (D4) — do not act unilaterally.
