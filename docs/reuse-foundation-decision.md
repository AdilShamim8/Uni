# reuse-foundation-decision.md — selected base and evidence

Decision of record for the 12 November 2026 reuse-first prompt (§3):
**retain Uni's current foundation** (React/Vite frontend shell, Fastify
application, PostgreSQL model, Better Auth identity boundary, AI SDK
provider adapters, pg-boss worker/outbox, grants and owned artifacts).
No whole-base fork. This file records the comparison evidence that
produced the decision.

## Baseline facts (verified fresh this session at REUSE_START_SHA
`a84aac2b06d91a00699315ed28409bdd6f9e1b84`)

| Check | Result (2026-11-12, this session) |
| --- | --- |
| contracts `npm ci && build && typecheck` | pass, clean |
| backend `npm ci && typecheck && build` | pass, clean |
| backend `npm test` | **346/346 across 41 files** (embedded PostgreSQL, ~115s) |
| frontend `npm ci && typecheck && lint` | pass, clean |
| frontend `npm test -- --maxWorkers=1` | recorded in `docs/verification.md` this session |
| Remote state | clone from origin/main matched the researched HEAD; no concurrent upstream changes |

## Question 1 — which existing Uni journeys work?

Fresh source audit at the baseline SHA (each row cites the real path; the
test count is the current suite, not an inherited claim):

| Journey | Frontend path | Backend path | Evidence |
| --- | --- | --- | --- |
| Sign-up/in/out, workspaces | `features/settings/AccountSection` via `services/api/serverSession` | `modules/auth`, `modules/me` | `auth.integration` 6; account fencing suite |
| Configure provider (BYOK local + server, encrypted) | `features/settings/ProvidersSection`, `AccountSection` | `modules/providers` (SSRF guard, AES-GCM envelope, readiness axes, body caps) | providers suites (integration, readiness, keyless, openrouter, body-limits) |
| Server chat: choose model → send → stream → stop → reload | Account chat surface via `services/api/serverRuns` (SSE) | `modules/runs` (idempotent create, fingerprint replay, atomic admission, durable cancel, replay) | `runs.integration`, `runs-fingerprint`, `runs-concurrent-create`, `runs-atomic-*` |
| Agent sessions with tools + permissions | `serverSessionStore` agent slices | `modules/agent` (sessions/turns/permissions, bounded tools, gated loop) | agent suites (roots, admission, permission-gate, execution-boundaries, bounded-tools, runs, sessions) |
| Work tasks on durable runs | `features/work` server mode via `services/api/serverWork` | `modules/work` + `modules/jobs` (pg-boss worker + outbox) | `work-tasks`, `work-sync`, `jobs-outbox` |
| Employees + memory (dual-mode) | `features/agents` via `serverEmployees` | `modules/employees`, `modules/memory` (+ vendored kernel) | `employees-memory.integration` 11 + vendor suite 23 |
| Library canonical saves | `features/library` via `serverLibrary` | `modules/library` | `library.integration` 6 |
| Plugins with grants/receipts | `features/plugins` | `modules/plugins` | `plugins.integration` 6 |
| MCP servers (guarded transport) | Plugins page MCP section via `serverMcp` | `modules/mcp` | `mcp-servers`, `mcp-call` against a real SDK server |
| Local-mode branched chat, demo/BYOK streaming | ChatPage + `liveChatAdapter` | — (browser-only) | `chatFlow`, `conversationTree`, `sseProtocol`, `byok` |

Gaps that remain (honest): server-mode chat still lives in the Account
surface, not the unified ChatPage; files/extraction, retrieval index,
connectors, routines execution, isolated code/browser execution,
messaging, voice and image generation are not implemented (backend-upgrade
ledger T026–T049 open; the bash tool is deliberately inert until the
P11 isolation worker exists).

## Question 2 — what would a pinned LibreChat fork provide immediately?

LibreChat (MIT, license file inspected by the prompt's research pass)
is a mature multi-provider chat application: provider presets and
endpoints, file/RAG pipelines (its API server + MongoDB + vector DB),
agents, artifacts, MFA. Its runtime assumptions differ from Uni's
foundation on every axis that matters here:

- Persistence: MongoDB (Uni: PostgreSQL + Drizzle; Uni's roadmap
  explicitly selected "no second datastore, no Redis, no vector DB").
- Identity: its own JWT/session model (Uni: Better Auth + workspace
  scoping; every table is workspace-scoped through server-derived
  membership).
- Durable execution: none comparable to Uni's pg-boss outbox/worker
  with lease semantics for runs.
- Contract boundary: none comparable to `packages/contracts` (zod DTOs
  shared by both sides).
- Conversation model: LibreChat messages fork on edit, but Uni's
  tree model (parent links, sibling variants, active path, stable
  clientIds, idempotent node creation) has no upstream equivalent to
  map onto.

## Question 3 — what data would need migration?

Accounts/users, workspaces+memberships, conversation trees with branch
structure, provider credentials (Uni's AES-GCM envelope vs LibreChat's
encryption path), grants/receipts (no upstream equivalent), memory
notes + audit journal (no upstream equivalent), library artifacts +
immutable versions, runs + ordered events, MCP server configs. For
most of these the fork has no destination schema — migration means
schema redesign, not row copies.

## Question 4 — stack changes a fork would cause

New MongoDB deployment and ops; replacement or dual-write of the whole
identity boundary; rewrite of the durable worker (pg-boss is
PostgreSQL-native); abandonment of `packages/contracts` and both test
suites (346 backend + frontend suite); re-implementation of workspace
authorization; Vite frontend replaced by the fork's client build.

## Decision

| Route | Integration burden | Product coverage |
| --- | --- | --- |
| **A. Retain Uni foundation (selected)** | Zero cutover; the remaining gaps (files, connectors, routines, isolation, messaging) are additive modules in the existing architecture, queued as T026–T049 + the UI unification work in this effort | All journeys in the Question-1 table work today with test evidence |
| B. Pinned LibreChat fork | New datastore, new identity, worker rewrite, contract abandonment, schema redesign for grants/memory/branches — before any new capability appears | Multi-provider chat + RAG out of the box; Uni-specific surfaces (Work, employees/memory, grants) have no upstream equivalent |

The alternative is not clearly better; the prompt directs using the
current Uni foundation in that case. A whole-base change would also
require an isolated branch with reversible cutover and data migration —
none of which is justified by the comparison above.

## Selected upstream composition (per prompt §4, reuse order)

| Responsibility | Selection | Reason |
| --- | --- | --- |
| Product identity/persistence | Current Uni (Better Auth, Drizzle/PostgreSQL, contracts) | Reuse order #1: proven, meets acceptance |
| Main application UI | Uni shell + existing `components/ui` system (tokens, themes, 15 primitives) with targeted additions; NO embedded second component runtime | Reuse order #1; assistant-ui is recorded as evaluated-not-adopted (its runtime adapters would add a competing orchestration truth for no demonstrated gap — see the matrix) |
| Streaming/model protocols | Existing AI SDK adapters (`ai`, `openai-compatible`, `anthropic`) | Already integrated, fixture+keyless-live verified |
| Durable jobs | Existing pg-boss/outbox/worker | Reuse order #1 |
| Tool protocol | Existing MCP SDK integration + Uni grants | Reuse order #1 |
| Multi-step Work | Existing Uni agent loop | Reuse order #1; no demonstrated missing capability |
| Document extraction (P10) | Bounded text extraction (txt/md/csv) first; heavier engines evaluated by their runtime cost before any adoption | Prompt default: one bounded worker, not a RAG stack |
| Browser work / E2E | Playwright acceptance checks (to be added as dev tooling in this effort) | S20 preferred acceptance framework |
| Voice/image/messaging | Honest not-available states until a real configured dependency exists | Prompt §8: no unsafe or fabricated enablement |

Adapted-source additions during this effort must follow the exact
upstream procedure (prompt §5) and land in `docs/opensource-reuse.md`,
`third_party/sources.lock.json`, and `THIRD_PARTY_NOTICES.md`.
