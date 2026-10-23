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
