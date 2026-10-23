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
