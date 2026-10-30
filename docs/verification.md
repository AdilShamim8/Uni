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

## Backend QA pass — full verify + two fixes (2026-10-26)

Scope: user-requested full backend verification on `main` after the B04
merge (PR #24), hunting for bugs, with every gate re-run before commit.
Branch `feat/qa-backend-verify` (off `origin/main`).

| Command | Result |
| --- | --- |
| `cd packages/contracts && npm install && npm run build` | **Pass** — dist emitted (note: a plain `cd backend && npm install` in this sandbox left `dist/` unbuilt once; building the contracts package directly is the reliable order) |
| `cd backend && npm run typecheck` | **Pass** — 0 errors (src + tests), before and after the fixes |
| `cd backend && npm test` | **103/103** (12 files; 101 pre-existing + 2 new regression tests) |
| `cd backend && npm run build` | **Pass** — clean compile to dist/ |
| `node backend/scripts/smoke-live.mjs` (new) | **11/11** — boots embedded PostgreSQL, runs migrations, starts the compiled `dist/server.js` in production mode over real HTTP, and checks: liveness, readiness, 401 on unauthenticated `/api/v1/me`, sign-up + HttpOnly `uni-auth.session_token` cookie round-trip, authenticated `/me`, the memory-block 404 fix (live), employee create, block 200 for an existing employee, library canonical-save, SIGTERM graceful exit |

Bugs found and fixed (each with a regression test or live check):

- **Memory block route never 404'd.** `GET /api/v1/employees/:id/memory/block`
  returned 200 with an empty block for unknown or cross-workspace ids
  while every sibling route (notes, journal) answered 404 — the route's
  `if (!block)` guard was dead code because `buildMemoryBlock` always
  returns a truthy DTO. Fix: explicit `findEmployeeRow` existence check
  in the route (the builder itself stays non-throwing — run execution
  relies on it degrading dangling agents to the base prompt). Two
  regression tests: unknown id 404 + cross-workspace 404 (existence not
  leaked), both asserting the `not_found` envelope code.
- **SSE sentinel was dead code.** The run-events stream poll carried
  `if (sentinelSeen || true)` — an always-true condition shipped in the
  original B03 commit that made `sentinelSeen` write-only and hid the
  sentinel's documented purpose. Fix: the sentinel now triggers an
  immediate `refreshTail()` (prompt close instead of waiting up to the
  200 ms poll tick); the poll itself stays unconditional as the
  documented database backstop for the subscribe/finalize race; the
  dead flag is removed. Covered by the existing runs SSE suites
  (stream-to-terminal closure exercised in runs + runs-memory
  integration tests) and the live smoke.
- **`.env.example` omitted `BETTER_AUTH_SECRET`.** Production mode
  hard-crashes without it (Better Auth refuses the default secret when
  `NODE_ENV=production`), but the example environment file never
  mentioned it — a fresh deployment following the docs would not boot.
  Fix: documented in `backend/.env.example` with a generation command
  (found by the new live smoke, which runs the compiled server in
  production mode).

Investigated and confirmed NOT bugs: `console.log('Migrations
applied.')` in `src/db/migrate.ts` (CLI script output channel, not a
logger bypass in request paths); `console.error` in
`recordMemoryChange` (deliberate best-effort journal failure path,
documented upstream semantics); `me.routes.ts` createdAt branching
(Date vs string both resolve to integral epoch ms); urlGuard blocked
ranges (IPv4/IPv6 coverage re-checked, DNS-resolved, no pattern
matching); rate-limit map growth (pruned per call, bounded by
workspace count in a single-process design).

Not run this session: live external providers (no real keys), frontend
suite (no frontend files touched by the fixes — the two code changes
are route-level backend behavior with no contract change), hosted
deployment checks (B08).

## Backend QA pass — connection teardown (2026-10-26, second pass)

Scope: user-requested re-check on `main` after the PR #25 merge ("double
check and test everything"). All gates re-run from a clean sync at
`fac3330e1`; one real defect found and fixed. Branch
`fix/pg-pool-teardown` (off `origin/main`).

| Command | Result |
| --- | --- |
| `cd backend && npm run typecheck` | **Pass** — 0 errors (src + tests), before and after the fix |
| `cd backend && npm test` (before fix) | **103/103 pass, but 1 unhandled error** — `FATAL 57P01 terminating connection due to administrator command` attributed to `tests/runs.integration.test.ts` (probabilistic: not present in an isolated re-run of that file, present under the full suite) |
| `cd backend && npm test` (after fix) | **103/103, zero errors — run twice consecutively** to confirm the race is closed |
| `cd backend && npm run build` | **Pass** — clean compile to dist/ |
| `node backend/scripts/smoke-live.mjs` | **11/11** — compiled production server over real HTTP, including graceful SIGTERM exit |

Bug found and fixed:

- **A leaked database connection crashed test runs (and would crash
  production).** `pg`'s `Pool` re-emits idle-client errors on the pool
  itself (`pool.emit('error', err, client)` in `pg-pool`'s idle
  listener), and the app attached no `'error'` listener — so any
  server-side termination of an idle pooled connection (database
  restart, network drop, or the embedded server stopping mid-close)
  surfaced as an **uncaught exception**, not a log line. Compounding
  it, `Pool.end()` resolves once client termination has been
  *initiated*, not once every socket has finished closing; stopping the
  embedded PostgreSQL in that window makes backends deliver `FATAL
  57P01` to still-parse-enabled closing sockets. Fix, three parts:
  (1) `attachDatabase` now logs idle-client errors at warn level and
  lets the pool replace the dead client — in production this turns a
  crash into a recoverable event; (2) the `createDatabase` test helper
  gets the same guard; (3) the test harness and the live smoke script
  drain 250 ms between app close and embedded-Postgres stop so close
  handshakes finish first. Root cause verified against the installed
  `pg-pool`/`pg` sources (`node_modules`), not assumed.

Investigated and confirmed NOT bugs: SSE keepalive/poll intervals
(cleared in `cleanup()` and `unref`'d); run registry (holds no
connections or timers — pure in-process maps); the double `app.close()`
in the runs test teardown (Fastify close is idempotent, hooks run
once); `waitForRunStatus` polling (goes through the pooled app
database, no side connections).

Not run this session: live external providers (no real keys), frontend
suite (no frontend files touched), hosted deployment checks (B08).

## Provider-freedom wave (2026-10-29)

Scope: make "any provider, any model, free" real for beginners — suggested
models, wider preset catalog, free-tier markers, honest OpenRouter
verification (frontend + backend), CI, and the beginner-facing root README.
HEAD at record time: `94331c1ad1` (commits pushed one at a time per working
agreement).

| Command | Result |
| --- | --- |
| `frontend && npm run typecheck` | **Pass** (both tsconfigs) |
| `frontend && npm run lint` | **Pass** — no findings |
| `frontend && npx vitest run` | **338/338 tests pass across 48 files** (321 baseline + 17 new: suggested-model matching/catalog/uniqueness 10, presets + free badges + one-tap add + OpenRouter free picks 4, model-list collapse 1, OpenRouter /key + ordering + X-Title 2... counted within the files touched) |
| `backend && npm run typecheck` | **Pass** — 0 errors |
| `backend && npx vitest run` | **105/105 tests pass across 13 files** (103 baseline + 2 new OpenRouter /key tests, mocked DNS + fetch, no network) |
| `packages/contracts && npm run build && npm run typecheck` | **Pass** |
| Browser QA (Vite dev, Chromium via agent-browser) | Fresh state → deep-link to Providers → add LM Studio preset → custom endpoint `http://localhost:5188/v1` → Connect with key → **3 models auto-discovered** ("3 total" count label) → activate model → **Live badge** ("streaming ... straight from this browser") → sent message → **real SSE reply streamed** ("Hello from the mock provider!...") → mobile 390×844 responsive; **zero page errors, zero console errors** |

Live-verified details:

- OpenRouter catalog facts re-checked against the live endpoint
  (`GET openrouter.ai/api/v1/models`, 457 models, 16 `:free`): suggestions
  and the free-first ordering use real current ids.
- OpenRouter `/key` confirmed auth-protected (401 with a fake key) before
  shipping the honest-verification fix; `/models` confirmed public.
- Backend booted against an embedded PostgreSQL on :5432 with migrations:
  `/health/ready` → `{"status":"ready","checks":{"database":{"status":"up"}}}`;
  live API smoke: sign-up 200, provider create 201, credential set 200,
  provider list 200 (redacted credential view), OpenRouter test honest.
- Environment gotcha found and documented: an exported shell `DATABASE_URL`
  overrides `backend/.env` (dotenv precedence) — recorded in backend README
  and root README troubleshooting.

Not run this session: real paid provider keys (none available — provider
behavior verified against a local OpenAI-compatible mock with real HTTP +
SSE, and live OpenRouter public endpoints), Docker Compose stack (no Docker
daemon in sandbox).

## Provider-freedom wave — closing record (2026-10-29)

Final state at wave close — this is the 300th commit of the repository
(the wave's 91st, closing the milestone):

| Check | Result |
| --- | --- |
| Frontend typecheck | **0 errors** |
| Frontend lint | **0 findings** |
| Frontend tests | **339/339 across 48 files** |
| Backend typecheck | **0 errors** |
| Backend tests | **105/105 across 13 files** |
| Contracts build + typecheck | **Pass** |
| Working tree | **Clean** — nothing uncommitted |
| Live GitHub checks | README heading anchors verified against the rendered page (emoji-variation-selector anchors resolved); all `docs/screenshots/*.png` return HTTP 200 from raw.githubusercontent.com |
| Commit attribution | All wave commits authored as Adil Shamim <157037615+AdilShamim8@users.noreply.github.com>, pushed one at a time to `main` |

Wave totals: 91 commits (210 → 300), one pushed at a time. Every commit
typechecks and tests green at its own HEAD; no fix-up commits were needed
after the final suites above.

The repository now stands at exactly 300 commits on `main`.

## Re-verification at HEAD `cb75cb9bf` (2026-10-29, post-milestone)

Full double-check after the 300-commit milestone, at the user's request.
HEAD includes the two post-milestone commits merged from GitHub
(dependabot PR #27 — GitHub Actions bumps only; no product code changed).

| Check | Result |
| --- | --- |
| Frontend typecheck (both tsconfigs) | **Pass — 0 errors** |
| Frontend lint | **Pass — 0 findings** |
| Frontend tests | **339/339 across 48 files** |
| Backend typecheck | **Pass — 0 errors** |
| Backend tests | **105/105 across 13 files** |
| Git state | `main` clean, synced with `origin/main` (302 commits; #300 was the wave milestone, #301–302 merged by the repo owner from GitHub) |
| Wave attribution re-check | All 91 wave commits (5f3cf5861 → e64b73455) authored **and** committed as Adil Shamim <157037615+AdilShamim8@users.noreply.github.com> |

Live E2E (embedded PostgreSQL :5432 + backend :4000 + Vite :5173 + mock
OpenAI-compatible provider :5188, browser QA via agent-browser):

- Backend `/health/ready` → `{"status":"ready","checks":{"database":{"status":"up"}}}`.
- API smoke (curl, session cookie): sign-up 200 → provider create 201
  (strict kind validation caught an invalid kind with a clear 400) →
  BYOK credential set 200 (redacted response; key never returned) →
  provider list 200 (redacted) → connection test made a **real outbound
  call to api.openai.com** (54 ms, honest "provider rejected the API key"
  on a fake key, status persisted) → URL guard refused a loopback endpoint
  fetch with 0 ms latency (no outbound call) → delete 204.
- Browser golden path: home renders with zero page errors → settings →
  Providers → "LM Studio (local)" preset (label/type/endpoint prefilled,
  suggested-model chips shown) → endpoint changed to the mock → key
  entered → **Connect** → **3 models auto-discovered** ("3 total") →
  model activated → **Live badge** ("streaming ... straight from this
  browser") → message sent → **real SSE reply streamed into the chat**
  ("Hello from the mock provider! Your BYOK setup is streaming
  end-to-end.", labeled "Live reply from LM Studio (local)").
- Mobile 390×844: responsive layout, navigation collapses to a drawer,
  zero errors. Desktop 1280×800: clean.
- README re-check: all 10 screenshot files present in the repo and
  referenced correctly; raw.githubusercontent.com URLs return 200.

Not run (unchanged limits): real paid provider keys (none available;
verified via the local mock with real HTTP + SSE and the live OpenAI
outbound 401), Docker Compose stack (no Docker daemon in sandbox).

## Dependabot-repair re-verification (2026-10-29, HEAD `f161db973`)

The double-check above ran at `cb75cb9bf`; while it was in flight, ten
more dependabot PRs (#28–38) were merged on GitHub, landing major bumps:
zod 4 (contracts), TypeScript 7 (contracts), lucide-react 1, pino 10,
better-auth 1.7.13, the eslint 10 stack, and @vitejs/plugin-react 6.
Re-checking everything against the new HEAD found real breakage, which
this wave repairs:

- **Frontend un-installable**: `@eslint/js@10` peers on `eslint@^10`
  (pinned ^9.12) and `@vitejs/plugin-react@6` peers on `vite@^8`
  (project runs 5.4) → ERESOLVE. Fixed by `eslint ^10.0.0` (inside
  typescript-eslint 8.72's accepted range) and `plugin-react ^5.2.0`.
- **lucide-react 1.x removed brand icons** → `Github` import failed
  typecheck; swapped to `Code2` (development plugin category).
- **Mixed zod majors**: contracts (zod 4) + backend (zod 3) broke the
  library canonical-save at runtime — 4 integration tests failed, 3
  typecheck errors. Fixed by moving the backend to zod `^4.6.7` (one
  major everywhere; the backend's own usage is fully v4-compatible).
- **eslint 10 + react-hooks 7 surfaced 12 findings** — 6 real fixes
  (useCallback purity, latest-ref sync via passive effect, Error cause,
  dead initializers, ES2022 lib) + 6 documented deliberate sync
  effects with per-site justification disables (two mutate stores
  mid-transition, where the effect is the architecturally correct form).

Full re-verification at `f161db973`:

| Check | Result |
| --- | --- |
| Contracts build + typecheck (TypeScript 7, zod 4) | **Pass** |
| Backend typecheck | **Pass — 0 errors** |
| Backend tests | **105/105 across 13 files** |
| Frontend install (npm, clean tree) | **Pass — 0 vulnerabilities** |
| Frontend lint | **Pass — 0 errors, 0 warnings** |
| Frontend typecheck (both tsconfigs) | **Pass — 0 errors** |
| Frontend tests | **339/339 across 48 files** |

Live E2E re-run on the upgraded stack (embedded PG :5432, backend :4000
on zod 4, Vite :5173, mock provider :5188, agent-browser): fresh state →
Providers → LM Studio preset → mock endpoint → key → **Connect → 3
models auto-discovered** → activate → **Live badge** → message → **real
SSE reply streamed** ("Hello from the mock provider! Your BYOK setup is
streaming end-to-end.") → Plugins page renders with the Code2 icon →
mobile 390×844 responsive → **zero page errors, zero console errors**.

Repair wave commits (one at a time, all green at their own HEAD):
`31a066d61` (backend zod 4 + notices) → `f161db973` (frontend toolchain).

## CI repair wave — backend job green on GitHub Actions (2026-10-29)

**Trigger:** user-reported failing checks on `main`: "CI / Backend
(typecheck + integration tests)" failing after 20s on every run, plus
"Vercel — Deployment rate limited — retry in 24 hours".

**Root cause 1 (the backend job):** `backend/tests/helpers.ts` hardcoded
`TEST_SCRATCH_ROOT = '/home/z/my-project/.tmp'` — one machine's absolute
path. Every GitHub runner failed in beforeAll with
`EACCES: permission denied, mkdir '/home/z'` (10 suites), then afterAll
cascaded `TypeError: Cannot read properties of undefined (reading
'stop'/'server')`, doubling the noise. The job had never been green on
GitHub Actions; local runs passed because the path existed locally.

Fix `c427d8a80`: scratch root resolves from `UNI_TEST_SCRATCH_ROOT` when
set, else `<os.tmpdir()>/uni-backend-tests`.
Fix `2a670fed4`: all afterAll teardowns guarded (`?.` / truthiness) so a
failed beforeAll reports only its real error.

**Root cause 2 (surfaced once tests ran on CI, run #105):** the cancel
integration test failed with `expected undefined to be 'stopped'` —
`finalize()` committed the run's terminal status in one write and
inserted the assistant transcript node in a later transaction. A client
polling run status then immediately reloading the conversation could
observe a terminal run whose node was not durable yet; the CI runner
lost that race.

Fix `85db8a2cc`: status update + node insert + active-leaf advance now
commit in ONE transaction (either all visible or none; the lost-race
warning path is preserved).
Fix `4779ded6c`: the test waits for a real streamed chunk on the live
SSE stream before cancelling (was a fixed 400ms sleep racing first-token
latency).

| Check (latest run, HEAD `4779ded6c`, CI run #107) | Result |
| --- | --- |
| Backend typecheck | **Pass — 0 errors** |
| Backend tests (local) | **105/105 across 13 files**, runs suite 3/3 stable |
| Backend job on GitHub Actions | **Pass — first green run in repo history** |
| Frontend + Contracts jobs on GitHub Actions | **Pass** |
| GitHub Pages build + deploy | **Pass** |
| Vercel check | **External account rate limit — auto-retries in 24h**; documented in README Troubleshooting + CONTRIBUTING (not a repo defect) |

Local guard-behavior proof: with `UNI_TEST_SCRATCH_ROOT` pointed at a
non-directory, the suite fails with the single real error
(`ENOTDIR: not a directory`) and skips tests — no teardown cascade.

Wave commits (one at a time, each pushed separately): `c427d8a80` →
`2a670fed4` → `75d676ebc` (docs) → `85db8a2cc` → `4779ded6c` → docs
close-out.

---

## 2026-10-29 — Live QA sweep wave ("test everything like a tester")

*3 commits: `4a3b89f77` (auth rate-limit fix) → `6018ee565` (live QA
harness) → `1a96a95d6` (browser QA stack). Each pushed individually.*

### What ran

1. **`npm run qa:live` (new, `backend/scripts/qa-live.mjs`)** — boots
   embedded PostgreSQL + the COMPILED `dist/server.js` in production
   mode plus a mode-switchable fake OpenAI-compatible provider, then
   walks the whole public HTTP surface over real sockets like an
   external tester. **119/119 checks** across boot/health, auth (19),
   conversations/nodes (19), providers/BYOK + SSRF (27), employees +
   memory (14), library m07 rules (11), importer (6), runs lifecycle
   (20), shutdown. The harness always tears the stack down
   (`try/finally`) — a failure can never orphan a server or database.
2. **Backend suite** — typecheck clean; **117/117 tests across 14
   files** (12 new unit tests for the IP resolver).
3. **Frontend** — eslint clean, typecheck clean, production build
   clean; **339/339 tests across 48 files**.
4. **Browser walkthrough** (via `scripts/browser-qa-stack.mjs` + the
   Vite dev server, driven with a headless browser): account sign-up →
   server-provider BYOK (key stored, `POST /test` → "Connected — the
   key works. · 13 ms · 2 models discovered") → server conversation →
   message send → `POST /runs` → SSE stream → streamed reply rendered →
   sign-out → sign-in → transcript re-fetched from the server. Network
   log shows the full golden path (`conversations` → `nodes` → `runs`
   → `runs/:id/events`); **zero console errors, zero page errors**;
   visual render confirmed clean (modal backdrop verified as the only
   dark region — no clipping).

### Bug found and fixed by the sweep

**Auth rate limiting fell back to ONE shared bucket per path in
production.** The Fastify bridge hands Better Auth a Web `Request`,
which cannot carry the socket's remote address; Better Auth warned
("could not determine a client IP") and degrading to a single global
bucket — the sweep's second QA user got a 429 on sign-up through no
fault of their own, and any three sign-ups in ten seconds would lock
the auth surface for every user at once. The inverse hole existed too:
Better Auth trusts a client-set single-value `X-Forwarded-For`, so a
caller could rotate fake IPs and bypass per-IP limits entirely.

Fix `4a3b89f77`: the bridge resolves the identity server-side (direct
peer; `X-Forwarded-For` unwrapped right-to-left only when the peer
matches the new `AUTH_TRUSTED_PROXIES` list of IPs/CIDRs — `*` takes
the rightmost, observed hop), strips every spoofable forwarded header
from the inbound request, and injects the address under a private
header Better Auth reads exclusively. New optional `AUTH_RATE_LIMIT_MAX`
raises the sensitive-path budget for shared-egress (office/NAT)
deployments. The resolver's first live run also caught a trim bug
(untrimmed chain entries silently dropped, resolving to the wrong hop)
— now covered by a unit test.

### Sweep-harness findings that were NOT bugs (correct behavior verified)

- Fast provider streams may coalesce into fewer `delta` events (delta
  batching; per-chunk granularity proven by the cancel test).
- Library canonical-save without a link (`linkedArtifactId` /
  `sourceMessageId`) intentionally creates a fresh artifact; the no-op
  and in-place-version-bump paths require the m07 link.
- Node idempotency is keyed by `clientId`, not content dedupe.
- The browser-BYOK provider card (localStorage keys, direct
  browser→provider fetch) correctly reports CORS-blocked endpoints with
  an honest message — that path is local-by-design and separate from
  the server providers surface.

| Check (HEAD `1a96a95d6`) | Result |
| --- | --- |
| Backend typecheck + tests | **0 errors; 117/117 across 14 files** |
| `npm run qa:live` | **119/119** |
| Frontend lint / typecheck / build / tests | **clean / clean / clean; 339/339** |
| Browser golden path (sign-up → BYOK → run → SSE → persistence) | **Pass, zero console errors** |
| GitHub Actions (contracts, frontend, backend) | see close-out below |

## Free-worldwide wave (2026-10-30, later) — 14 commits, pushed one at a time

Scope: the $0 front door (free-models catalog, Start-at-$0 hub, inline
setup guides), the shareability flywheel (community agent gallery,
share-page export), screenshots, README/strategy/changelog docs. All
frontend-only; backend untouched this wave.

| Command (frontend/) | Result |
| --- | --- |
| `npx vitest run` (full suite, final state) | **394/394 across 57 files** — 359 pre-existing + 35 new (10 catalog, 5 hub, 4 guides, 5 gallery data, 4 gallery UI, 7 share export), 114.3s |
| Per-feature targeted runs during development | Each feature's suite green before its commit (catalog 10/10; hub 5/5 + settings regression 16/16; guides 4/4 + regressions 19/19; gallery data 5/5 + portability 10/10; gallery UI 4/4 + templates 15/15; share export 7/7) |
| `npm run lint` | **Pass** — no findings |
| `npm run typecheck` (both tsconfigs) | **Pass** — includes the new `resolveJsonModule` JSON imports |
| `npm run build` (typecheck + vite) | **Pass** — only the known pre-existing chunk-size warning for the markdown highlighter bundle |
| Screenshots (agent-browser, real dev server on :5199) | 4 fresh 1440×900 captures from the running app in demo mode; zero page errors, zero console errors during the capture session |

Notes:

- Each of the 14 commits was pushed individually (`git push origin main`
  after every commit), per the repo's working agreement; every
  intermediate commit is self-contained and green (feature + its tests
  ship together; docs commits touch no code).
- Browser verification of the new surfaces (hub expansion, route
  prefill, guide visibility, gallery scroll, share menu) was done via
  the same session that produced the screenshots — element presence
  and scroll were confirmed programmatically before each capture.
- Backend suite intentionally not re-run: no backend file changed this
  wave (last recorded state 117/117; CI covers it on push).
