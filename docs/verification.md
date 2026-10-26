# verification.md — actual commands and results

Record every gate's real evidence here: commands, results, limits. Never
report intent as result. Environment: Node v24.21.0, npm 11.19.0, 2 vCPU,
4 GB RAM, Linux sandbox (no Docker daemon, no system PostgreSQL — DB
strategy documented per gate).

## B00 — baseline (2026-10-23)

Repository: cloned from `https://github.com/AdilShamim8/Uni.git`, HEAD
`3ad6b95c30972c728f8895da8137bf0cd6d85202` ("Merge pull request #19 from
AdilShamim8/feat/qa-grokbot-polish", 2026-10-20). Clean working tree at
start; no backend directory present at HEAD.

| Command | Result |
| --- | --- |
| `cd frontend && npm ci` | Completed (npm warnings about esbuild install script only; no errors) |
| `npm run build` (typecheck + vite) | **Pass** after the B00 fix; before the fix, one TS error was introduced and corrected during the session. Vite reports the known mixed static/dynamic import warning for `libraryStore.ts` (bundling observation, pre-existing, not a blocker) |
| `npm run lint` | **Pass** — no findings |
| `npm run test -- --maxWorkers=1 --minWorkers=1` | **278/278 tests pass across 41 files** (274 pre-existing + 4 new regression tests), 60.7s |

Notes:

- The prompt's recorded baseline (270 passed / 4 timed out under load;
  274/274 isolated) was reproduced in spirit: the isolated single-worker
  run passes everything. Timings under parallel load were not re-measured
  this session; no assertion failures occurred in any run.
- The React warning "Cannot update a component (`Sidebar`) while rendering
  a different component (`EmployeeView`)" is **fixed** by moving
  `openAgentConversation` out of `useMemo` into an effect; regression
  tests assert no render-time mutation, Strict Mode thread singularity,
  and navigation thread reuse (`tests/employeeThreadLifecycle.test.tsx`).
- Live deployed URL was not browser-retested this session (no rendered
  desktop/mobile audit performed); no claim is made about it.

## B01 — running backend and contracts (2026-10-23)

Environment note: this sandbox has no Docker daemon and no system
PostgreSQL; integration tests use the `embedded-postgres` package (real
PostgreSQL 18 binaries, disposable data dir under gitignored `.tmp/`).
`infra/docker-compose.yml` remains the documented path for a persistent
development database on normal machines.

| Command | Result |
| --- | --- |
| `cd packages/contracts && npm install && npm run build` | **Pass** — dist emitted; `API_ROOT`/schemas importable |
| `cd backend && npm install` | **Pass** — installs deps; `@uni/contracts` built via its `prepare` script |
| `cd backend && npm run typecheck` | **Pass** — 0 errors (src + tests) |
| `cd backend && npx drizzle-kit generate` | **Pass** — migration `0000` for `db_metadata` committed under `backend/drizzle/` |
| `cd backend && npm test` (vitest run) | **11/11 tests pass across 2 files**: 7 app tests (liveness, readiness 503/200, error envelope incl. 404/AppError/zod-400/no-leak, x-request-id echo, CORS allow/deny) + 4 embedded-PG integration tests (migrations apply, idempotent re-run, Drizzle CRUD round-trip, readiness up/down with no connection-string leak) |
| `cd backend && npm run dev` (manual smoke) | API starts on 127.0.0.1:4000; `/health/live` 200; `/health/ready` 503 without DATABASE_URL (expected, honest) |

Frontend API wiring (B01, second increment):

| Command | Result |
| --- | --- |
| `cd frontend && npx vitest run tests/apiClient.test.ts` | **5/5 pass** — base-URL joining, credentialed JSON requests, error-envelope → ApiError, non-JSON fallback, 204 handling |
| `cd frontend && npm run build && npm run lint` | **Pass** after adding `src/services/api/client.ts`, the vite dev proxy (`/api`, `/health` → 127.0.0.1:4000), and `.env.example` (public URL only) |

Decision recorded: the frontend keeps a mirrored error-envelope type
instead of importing `@uni/contracts`, so the existing Vercel static
deployment (build root `frontend/`) keeps working; direct contract
imports are revisited when the single-origin deployment lands (B08).

## B02 — identity, persistence, deliberate import (2026-10-23)

Backend (three slices, each committed separately):

| Command | Result |
| --- | --- |
| `npx vitest run tests/auth.integration.test.ts` | **6/6** — sign-up→workspace+HttpOnly cookie, /me 200/401, sign-in/sign-out lifecycle, untrusted-origin CSRF 403 (origin check force-enabled for tests — Better Auth disables it in test envs by default), AUTH_REGISTRATION=closed fail-closed, hashed password storage |
| `npx vitest run tests/conversations.integration.test.ts` | **7/7** — pagination cursor walk, sibling branches + active-leaf switching, cross-user GET/PATCH/node/DELETE → 404 with no content leak, cross-conversation parent + activeLeafId → 400, stale expectedUpdatedAt → 409, clientId idempotency (single row), cascade delete |
| `npx vitest run tests/import.integration.test.ts` | **6/6** — preview stores nothing, commit + replay (same batch, same mapping, no duplicate rows), temporary conversations skipped, structurally broken backup → 400 with zero writes, per-workspace isolation |
| `npm run typecheck` | 0 errors |

Frontend integration:

| Command | Result |
| --- | --- |
| `npx vitest run tests/accountServer.test.tsx` | **7/7** — sign-in form/hydration, real-route sign-in flow, error-envelope display, server conversation list + read-only tree with branch labels, sign-out clears all server-derived state, deliberate two-step import (preview→confirm with exact payloads), idempotent-replay honesty |
| `npm run build && npm run lint` | **Pass** (typecheck incl.) |
| `npm run test -- --maxWorkers=1 --minWorkers=1` | **290/290 tests across 43 files** (283 prior + 7 account) — byok/settings fetch-mocks updated to serve the new app-boot session probe via `sessionAwareFetch` (documented behavior, not a suppression) |

Honest limits recorded: server conversations are read-only in Settings → Account; chat-surface send against the server lands with B03's backendChatAdapter + runs. Temporary chats remain local/session-only. Email verification/password recovery unavailable (no mailer configured). Cross-user denial verified at the API level (404 without existence leaks); a full browser-audited two-user journey is deferred to B08's hosted check.

## B03 — server BYOK and streamed chat

(pending)


## B03 — streamed chat runs (26 Oct 2026)

Gates run before every commit in this slice (one commit at a time,
each pushed individually):

- `backend`: `npm run typecheck` clean; `npm test` **57/57** (8 files)
  — including the new `runs.integration` suite (9 tests: end-to-end
  stream + reload-visible transcript, idempotent create, cancel with
  partial output, repetition stop via the vendored guard, provider
  error never complete, workspace isolation across create/read/events/
  cancel/provider, concurrency 429, restart reconciliation, missing
  credential 400) and the vendored OpenClaw guard suite (11 tests).
- `packages/contracts`: build clean (runs schemas added).
- `frontend`: `tsc --noEmit` clean; `eslint src tests` clean;
  `npm run build` clean; `npm test` **292/292** (43 files) —
  accountServer extended to 9 tests with the exact backend routes
  mocked (provider add + key-sent-once, end-to-end send with node/run/
  stream call assertions, honest no-provider hint).
- Conversations regression for the messageCount fix: list reports the
  real node count after creating three nodes (the pre-fix subquery
  fails this test).

### Browser E2E (dev stack: embedded PostgreSQL + Fastify :4000 + Vite proxy :5190)

Journey, all against the real backend and a local fake provider:

1. Sign-up (name/email/password) → signed-in Account view.
2. Server provider added through the UI (label, OpenAI-compatible,
   `http://127.0.0.1:4571/v1`, model, key) — key sent exactly once to
   the credential route; list shows redacted 'Key saved' state.
3. Server conversation created; message sent → user node + run created
   server-side → SSE deltas rendered live → truthful assistant node
   after refresh.
4. Honest error branch verified live: a provider that omits the
   finish_reason chunk (protocol violation) produced an `error` run
   with partial output kept on its own branch — never 'complete'.
   After fixing the fake provider, the next run completed cleanly.
5. Reload → same tree, same statuses, siblings preserved.
6. `messageCount` bug found in this pass (always 0 since B02) — fixed
   with a qualified correlated subquery + regression test; the live
   list now shows the true count (4 msg).
7. Zero page errors; console shows only Vite/React dev notices.
   Screenshots: `download/b03-e2e/`.

Not run this session: live external providers (no real keys — BYOK
journey covered by the local fake over the same code path), deployment
verification (B08), mobile-width pass of the Account surface.

## Post-merge full verification (26 Oct 2026)

Full-stack QA pass over merged main (B00–B03): every gate, a fresh
database, and a browser journey across local and server surfaces.

Gates (fresh `feat/qa-full-verify` branch off main `09b456341`):

- `backend`: typecheck clean; **58/58** tests (8 files); build clean;
  migrations applied cleanly to an empty embedded PostgreSQL 18
  database (fresh data dir, database `uni_e2e_v2`).
- `frontend`: typecheck clean; eslint clean; build clean; **320/320**
  tests (47 files) before the fix below, **321/321** after.

Browser journey (Vite :5191 → Fastify :4000 → embedded PG :4591, fake
OpenAI-compatible provider :4571), zero console/page errors throughout:

1. Local demo mode: chat send → streamed simulated reply with full
   message actions; Work task → quick question → artifact with linked
   task + honest provenance; Save to Library once (button becomes
   Update, second save impossible); Library lists it with provenance.
2. Agents: Uni hero with New/Built-in badges; starter chip opens the
   thread with a prefilled composer.
3. Settings: all six sections render (Account, Appearance, Chat, Data,
   Providers & models, Privacy & about). Command palette search,
   Compare models side-by-side run, dark mode, 390 px mobile — no
   horizontal overflow anywhere.
4. Server mode (the new B03 surface): sign-up → add provider → Test →
   conversation → send → streamed reply → reload — session, provider,
   and tree all persisted.

### Bugs found and fixed (commit 915cacd53)

- **Server provider Test was silent and never discovered models.**
  The button called `POST /providers/:id/test` (key check only, no
  persistence) and discarded the response; the discovery route
  (`/providers/:id/models`) was never called by the frontend. With no
  `modelId` and empty `models`, `sendServerMessage` always failed with
  "no model selected yet" — server chat was unusable unless the user
  typed a model id by hand, and the form hint "discovered on test" was
  false. Fix: Test calls the discovery route (persists models
  server-side), renders the result verbatim (message, latency, model
  list), names the model server chat will use on the row, and the
  no-model send error now points at the recovery action. Re-verified
  live with a brand-new user: add provider without a model → Test →
  feedback visible → send → streamed reply.
- **Stale conversation list after sending.** The summaries (message
  count, updated time) kept pre-send values until a manual Refresh.
  Fix: `sendServerMessage` re-fetches the list when the run settles.
  Verified live: both threads show "2 msg" immediately after send.

Investigated and confirmed NOT bugs: dialog scrim "covering" clicks (a
QA-tool actionability race with the vertically re-centering dialog —
DOM hit-tests and real event dispatch land on the buttons); sidebar nav
pointer clicks not firing in the QA tool (keyboard and JS clicks work;
jsdom tests cover the wiring); a suspected `const odelId` syntax error
that was a terminal-rendering artifact (byte-exact source is
`const [modelId, setModelId]`).

Not run this session: live external providers (no real keys), hosted
deployment checks (B08).


## B04 — employees, memory, Library (2026-10-26)

Gate commands and results (branch `feat/b04-employees-memory-library`):

- `npm run typecheck` (backend): 0 errors.
- `npm test` (backend, embedded PostgreSQL per file, migrations through
  0006): **101/101** — app 7, db 6, auth 6, conversations 7, import 6,
  providers 7, runs 9, openclaw vendor 7, openmausbot vendor 23,
  employees+memory 11, library 6, runs wiring 3.
- `npm run build` (backend): clean.
- Contracts package `npm run build`: clean (new employees/memory/library
  schemas exported).
- Frontend untouched this gate (321/321 recorded at the B03 QA session;
  no frontend files changed on this branch).

Notable checks inside the suites: credential shapes never persist
(`sk-ant-…` redacted on write, note stays usable); stale edits 409 with
the current text + hash; journal rows carry honest unified diffs with
actor/via/kind; revert restores the SAME row (no duplicate); memory
block hides expired/superseded entries but preserves them; the outbound
provider request carries persona + memory in the system slot and recall
in front of the user message (never the system); contract-schema
validation failures return 400 `validation_error` envelopes (regression
test) after the cross-zod-copy `instanceof` fix.

Not run this session: browser E2E of the new endpoints (no frontend
surface exists yet for them — deliberate followup), live external
providers, hosted deployment checks (B08).
