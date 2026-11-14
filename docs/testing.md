# testing.md — how to verify a change

The one-page answer to "what do I run before I push?" Every suite runs
locally with no Docker and no system PostgreSQL; the backend's
integration tests boot an embedded PostgreSQL per test file.

## The three suites

| Workspace | Install | Verify | Notes |
| --- | --- | --- | --- |
| `packages/contracts` | `npm ci` | `npm run build && npm run typecheck && npm test` | zod schema accept/reject suite (`tests/`), typecheck covers `src` + `tests` |
| `frontend` | `npm ci` | `npm run lint && npm run typecheck && npm test && npm run build` | Vitest + Testing Library (jsdom); `build` = typecheck + vite build |
| `backend` | `npm ci` (after building contracts, see below) | `npm run typecheck && npm run build && npm test` | integration tests boot embedded PostgreSQL binaries |

The backend links `@uni/contracts` as a `file:` dependency, so build the
contracts package first:

```bash
cd packages/contracts && npm ci && npm run build
cd ../../backend && npm ci
```

## What CI runs on every push

- **CI** (`.github/workflows/ci.yml`, pushes + PRs to `main`) — three jobs:
  - *Contracts (shared schemas)*: `npm ci`, `npm run build`,
    `npm run typecheck`, `npm test`
  - *Frontend (typecheck + tests)*: `npm ci`, `npm run typecheck`,
    `npm run lint`, `npm test`
  - *Backend (typecheck + integration tests)*: install + build contracts,
    then `npm ci`, `npm run typecheck`, `npm run build`, `npm test`
- **Frontend CI** (`.github/workflows/frontend-ci.yml`) — runs only when
  `frontend/**` or its own workflow file changes: lint, typecheck, test,
  and the production build.

Both workflows cancel a superseded run when a newer push lands on the
same ref (`concurrency` + `cancel-in-progress`), so a rapid series of
commits does not queue stale runs.

## Node version

CI pins Node 22. jsdom 30 → undici 8 needs **Node ≥ 22.19** (the zlib
zstd decompress API); Node 20 crashes at import time during `npm test`.
Any current Node 22 LTS or newer works.

## Tips that save time

- **Test the thing you touched, then the whole suite before pushing.**
  `npx vitest run tests/<file>` targets one file; the repo's discipline
  is coherent tested increments pushed one at a time.
- **Flaky-looking frontend failure?** Run the suite single-worker to
  rule out worker interference: `npm run test -- --maxWorkers=1
  --minWorkers=1`. Async surfaces (dynamic imports, fetch stubs) need
  `findBy*`/`waitFor`, not synchronous `getBy*` — see the connectors
  badge test (RF-113) for the pattern.
- **Backend integration tests are independent per file** — each gets a
  disposable data directory and its own postgres process. Run one file
  while iterating: `npx vitest run tests/conversations.integration.test.ts`.
- **Typecheck covers tests too**: `backend/tsconfig.typecheck.json` and
  `packages/contracts/tsconfig.test.json` include the test directories,
  so a stale inline type in a test (the RF-112 bug) fails `npm run
  typecheck` locally before it can fail CI.

## The contracts drift guard

The contracts suite exists to catch shape drift at the coupling point:
`packages/contracts/tests/workspace.test.ts` asserts the export payload
carries all six sections and their counters, and `tests/index.test.ts`
fails if the barrel stops re-exporting a module. If you change a DTO,
change its schema and its test in the same commit, and update both sides
(frontend mirrors + backend routes) per the repository rule.
