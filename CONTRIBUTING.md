# Contributing to Uni

Thanks for your interest in making Uni better. This guide gets a first
patch from zero to pull request.

## The one rule

**Truthful labels everywhere.** If a feature is simulated, say so in the
UI. If a status is unknown, show unknown. Never let the product claim
something works when it does not. Every existing decision follows this
rule, and every contribution is expected to respect it.

## Setup (5 minutes)

```bash
git clone https://github.com/AdilShamim8/Uni.git
cd Uni

# Shared API contracts first (backend depends on the build output)
cd packages/contracts && npm install && npm run build && cd ../..

# Frontend — the local-first app
cd frontend && npm install && cd ..

# Backend — optional for UI work, required for API work
cd backend && npm install && cd ..
```

## Everyday commands

| What | Where | Command |
| --- | --- | --- |
| Dev server (port 5173) | `frontend/` | `npm run dev` |
| Typecheck | `frontend/` | `npm run typecheck` |
| Tests (watch / run) | `frontend/` | `npm test:watch` / `npm test` |
| Lint | `frontend/` | `npm run lint` |
| Dev server (port 4000) | `backend/` | `npm run dev` |
| Typecheck | `backend/` | `npm run typecheck` |
| Integration tests | `backend/` | `npm test` |
| Build + typecheck contracts | `packages/contracts/` | `npm run build` |

Backend integration tests boot an embedded PostgreSQL per file — no
running database or Docker is required. Their scratch space lives under
`UNI_TEST_SCRATCH_ROOT` when set, else `<os.tmpdir()>/uni-backend-tests`;
never hardcode a machine-specific path in test setup code.

## Where things live

- `frontend/src/features/<name>/` — one folder per product surface
  (chat, settings, work, agents, plugins, library…).
- `frontend/src/state/` — Zustand stores; persistence is versioned and
  explicit.
- `frontend/src/services/` — adapters, storage, and connection logic
  (BYOK code lives here).
- `backend/src/modules/<name>/` — Fastify modules: routes + service per
  domain, schema in `src/db/schema.ts`.
- `packages/contracts/src/` — shared DTOs and zod schemas; the ONLY
  coupling point between frontend and backend. Change contracts first,
  then both sides.

## Before you open a pull request

1. `npm run typecheck` passes in `frontend/` and `backend/`.
2. `npm test` passes in both (CI runs the same suites).
3. `npm run lint` passes in `frontend/`.
4. New behavior has tests; bug fixes have a test that fails without the
   fix.
5. UI copy is honest (see the one rule) and wraps safely on mobile.
6. Commit messages follow `type(scope): summary` — e.g.
   `feat(frontend): suggested-model chips for OpenRouter`.

### About the checks on every commit

Three report on each push to `main`:

- **CI** (`.github/workflows/ci.yml`) — contracts, frontend, and backend
  jobs. This one is on contributors: keep it green.
- **pages build and deployment** — GitHub Pages publishing of the demo
  site. Automatic; green when the build succeeds.
- **Vercel** — deployment of the hosted live demo by the Vercel account
  connected to this repository. It is external to the repo: on the free
  tier it can report `Deployment rate limited — retry in 24 hours` after
  a day of many pushes. That is an account quota, not a code failure —
  Vercel retries automatically and nothing in the repository needs to
  change.

## Commit style

```
feat(frontend): one-tap model suggestions in the provider form
fix(backend): verify OpenRouter keys against the /key endpoint
docs(readme): troubleshooting section for CORS and key issues
test(frontend): free-first OpenRouter discovery ordering
```

Scopes in use: `frontend`, `backend`, `contracts`, `runs`, `providers`,
`memory`, `library`, `employees`, `conversations`, `auth`, `db`, `ci`,
`docs`, `readme`, `vendor`, `chore`.

## Security expectations

- API keys never leave the browser in local mode, and never leave the
  server unencrypted in server mode.
- Never log credentials, tokens, or session cookies.
- The SSRF guard (`backend/src/lib/urlGuard.ts`) must stay in front of
  every outbound provider request; if you add an outbound call, route it
  through `guardedProviderFetch`.
- Report security issues privately instead of opening a public issue.

## Licensing

By contributing you agree your work is released under the repository's
MIT license (frontend) and the licenses recorded in
`THIRD_PARTY_NOTICES.md`. Reused code must be permissively licensed and
recorded in `docs/opensource-reuse.md`.
