# Handoff — abacusai-bot backend port (2026-11-08, session 5)

## Done this session (all pushed & SHA-verified one at a time)

**Main CI repair (3 commits, all checks now green on main):**
- `50dd05fa6` backend deps: undici ^7.30.1 (undici 8.12 breaks the pinned
  dispatcher: `invalid onRequestStart method`), openai-compatible pinned
  3.0.84 (provider-type alignment with ai@7.0.159), lockfile regenerated.
- `7dad4d604` frontend toolchain: typescript ^5.6.3 (typescript-eslint
  8.72 caps <6.1.0), vite ^5.4.8 + plugin-react ^5.2.0 (vitest 2 needs
  vite ^5). Frontend allowScripts slipped into this commit too (npm
  wrote it); noted here for the record.
- `153a0cd8b` allowScripts declarations for npm >= 11.19.
- Verified: backend 256/256, frontend 522/522 + typecheck/lint/build;
  GitHub check-runs all success on tip (incl. Vercel deploy).

**Port branch `task/abacus-port-300` (13 commits, draft PR #59):**
- A000 manifest + MIT license attribution (upstream @ 925008cf).
- A001–A004 contracts: agent modes, permission vocabulary, AG-UI-shaped
  events, tool roster schemas, connector catalog (status literal
  'unavailable' — cannot claim live connection).
- A005–A006 permission gate: toolPath/workspace-path containment,
  secrets, tool-policy unattended rules, gateToolCall state machine
  (36/36 tests in tests/agent-permission-gate.test.ts).
- A007–A008 schema+migration 0011 (7 tables), session/events services
  (advisory-lock sequence, persist-then-publish).
- A009 roster executors: read/list/grep/write/edit/bash/web_fetch with
  caps, scrubbed env, SSRF-guarded fetch, untrusted-content fencing.
- A010 run engine: idempotent create + N016 fingerprint, provider
  resolution mirroring runs.service, tool loop with the permission
  PAUSE (persisted ask, awaited decision, 'always' allowances
  persisted + live-widened), cancel + stuck-run reconciliation.
- A011 routes (additive under /api/v1; SSE in the runs pattern).
- A012 integration tests 5/5 over embedded Postgres.

## Remaining toward the 300-commit goal (next session)

1. Routines module (P6): scheduler.ts minute-tick + slot-claiming on
   advisory locks (upstream cron-scheduler.ts design), routes
   GET/POST/PATCH/DELETE /api/v1/routines + /routine-runs, tests.
2. Connectors module (P7): catalog data from
   abacusai-bot/packages/connectors/src/registry.ts (top ~30 entries),
   GET /api/v1/connectors (all 'unavailable'), tests.
3. agent-runs.integration.test.ts: fake provider + run + permission
   ask/respond over real SSE (extend harness with fakeProviderServer
   pattern from tests/runs.integration.test.ts).
4. Docs: backend-roadmap B05 status, frontend-backend-map rows,
   verification.md session 5, manifest change-rows fill-in, reuse
   ledger Section-2 row for abacusai-bot.
5. Continue commit waves (roster tools + tests, one per commit) toward
   300; each pushed individually with `git ls-remote` verification.
6. Final: full suites, PR #59 ready + merge.

## Environment notes
- npm >= 11.19 needs `npm install-scripts approve` for esbuild +
  embedded-postgres (allowScripts now committed in package.json).
- Embedded PG tests: `cd backend && npx vitest run <file>`.
- Working tree is clean; branch tip `8ed593081` = remote.
