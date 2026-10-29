# Uni backend

TypeScript modular monolith: Fastify + PostgreSQL (Drizzle) + Zod. Shared
API contracts live in `../packages/contracts` (`@uni/contracts`, installed
as a `file:` dependency and built automatically on install).

## Commands

```bash
cd backend
npm install          # installs deps and builds @uni/contracts (prepare script)

# Development database (Docker on a normal machine):
docker compose -f ../infra/docker-compose.yml up -d
cp .env.example .env # adjust values; .env is gitignored

npm run db:migrate   # apply committed SQL migrations (backend/drizzle)
npm run dev          # start API with watch (tsx)

npm run typecheck    # tsc over src + tests
npm test             # vitest: app tests + DB integration tests
npm run build        # compile to dist/
npm start            # run compiled build (node dist/server.js)
```

Tests boot a real embedded PostgreSQL (downloaded once into node_modules)
on a random port — no Docker needed for `npm test`. `infra/docker-compose.yml`
provides the persistent development database instead.

Integration-test scratch space (per-run cluster data dirs) resolves in
this order: the `UNI_TEST_SCRATCH_ROOT` environment variable when set,
then `<os.tmpdir()>/uni-backend-tests` (e.g. `/tmp/uni-backend-tests` on
Linux). Both paths work unchanged on dev laptops and CI runners — set
the variable only if your temp directory is unwritable or too small.

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /health/live` | Process liveness — no dependencies touched |
| `GET /health/ready` | Readiness — bounded database check, no sensitive details |
| `POST /api/auth/sign-up/email` | Create account + personal workspace (policy-gated) |
| `POST /api/auth/sign-in/email` | Password sign-in → HttpOnly session cookie |
| `POST /api/auth/sign-out` | Invalidate the current session |
| `GET /api/auth/get-session` | Session introspection (Better Auth) |
| `GET /api/v1/me` | Signed-in user + resolved workspace (session required) |
| `GET /api/v1/conversations` | Paginated conversation list (cursor, archived filter) |
| `POST /api/v1/conversations` | Create a conversation |
| `GET /api/v1/conversations/:id` | Full conversation incl. message-tree nodes |
| `PATCH /api/v1/conversations/:id` | Rename/pin/archive/active-branch switch; optimistic concurrency via `expectedUpdatedAt` |
| `DELETE /api/v1/conversations/:id` | Delete conversation (nodes cascade) |
| `POST /api/v1/conversations/:id/nodes` | Append a user/assistant node (parent + idempotency validated) |
| `POST /api/v1/import/preview` | Dry-run backup import — counts, errors, unsupported sections; stores nothing |
| `POST /api/v1/import/commit` | Transactional, idempotent backup import (checksum replay; temporary chats skipped) |
| `GET/POST /api/v1/providers` | List / create provider connections (metadata + redacted credential view) |
| `PATCH/DELETE /api/v1/providers/:id` | Update / delete a provider (deleting removes the credential) |
| `PUT/DELETE /api/v1/providers/:id/credential` | Set / remove the encrypted API key (server-side only; never returned) |
| `POST /api/v1/providers/:id/test` | SSRF-guarded connection check with the stored key |
| `POST /api/v1/providers/:id/models` | Discover and persist the model list (guarded) |

Authentication uses Better Auth with the Drizzle adapter. Sessions are
HttpOnly cookies (`uni-auth-session_token`), Secure in production,
SameSite Lax. Untrusted origins are rejected on auth state changes
(CSRF). Registration policy: `AUTH_REGISTRATION=open|closed`. No email
service is configured in this milestone, so email verification and
password recovery are honestly unavailable; hosted deployments should
close registration or configure email before exposing sign-up.

Errors always use the contract envelope from `@uni/contracts`:
`{ code, message, requestId, details? }`. Responses carry `x-request-id`
(generated or echoed from the request).

## Layout

- `src/app.ts` — server factory (`buildApp`); testable without listening
- `src/server.ts` — API process entrypoint (listen + graceful shutdown)
- `src/config/env.ts` — zod-validated environment
- `src/db/` — schema, pool/Drizzle client, migration runner
- `src/lib/` — logging (redacted), app errors, timeout helper
- `src/middleware/` — centralized error envelope handling
- `src/modules/` — feature modules (health so far)
- `drizzle/` — committed SQL migrations (generated via `npm run db:generate`)
- `tests/` — Vitest suites (injection-based app tests + embedded-PG integration)

## Environment

See `.env.example`. `DATABASE_URL` is required in production; development
may start without it (`/health/ready` then honestly reports down).
`CORS_ORIGINS` is an explicit allowlist — no wildcard with credentials.

> **Precedence gotcha:** exported shell environment variables win over
> `backend/.env` (standard dotenv behavior). If your shell already exports
> a `DATABASE_URL` (common in polyglot workspaces), the `.env` value is
> silently ignored — `unset DATABASE_URL` or export the value you actually
> want.

## Provider connection tests

`POST /api/v1/providers/:id/test` and `POST /api/v1/providers/:id/models`
run the same honest check: a GET against the provider's model-list endpoint
through the SSRF guard (`src/lib/urlGuard.ts`), with the decrypted key only
in the auth header.

OpenRouter is special-cased: its model catalog is **public**, so a wrong
key still returns a model list. For `openrouter.ai` endpoints the check
additionally calls the auth-protected `/key` endpoint — a 401/403 there
fails the test with an honest message instead of a false "connected", and
discovered models list the `:free` tier first.
