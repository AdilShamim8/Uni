# Handoff — backend upgrade session 2 (2026-11-10)

Branch `task/backend-upgrade-p00-p14`. This session: **30 commits
(70-99 range on top of the previous 40)**, each pushed and verified
individually. Total task commits on the branch: **70**.

## Done and verified this session

**Environment**: sandbox was recycled — re-cloned from GitHub,
reinstalled all three packages, fixed a fresh-clone typecheck break
(`.ts` import specifiers in the F04 suite, commit 41).

**P04 complete (T016, T017)**:
- T016: `AgentProfile.serverEmployeeId` + `ensureServerEmployee`
  (idempotent, name-reuse, creation through the session store);
  MemoryPanel dual-mode — server notes load/add/remove through the
  memory service when linked, local otherwise (4 tests).
- T017: `Artifact.serverArtifactId`; both canonical save operations
  mirror through `/library/canonical-save` in server mode with
  `linkedArtifactId` dedup and immutable versions; server failure
  never blocks the local save (4 tests).

**P05 complete (T018, T019, T020)** — durable Work:
- T018: `work.ts` contracts, migration 0015 (`work_task`, `work_run`),
  the Work service (provisions the task's durable agent session as the
  assigned employee, read-only roster, revision runs through the normal
  admission path), routes, 3 integration tests.
- T020: `resolveTerminal` → `syncWorkRunOutcome` — task/run rows follow
  the agent run's terminal; receipts assembled from the run's OWN
  events (url/file source ids, truthful tool outcomes,
  provider-generated provenance, no credentials). End-to-end test
  includes answering a real per-origin web_fetch permission.
- T019: cancel/answer task actions (engine cancel, answer admits
  revision+1, honest 409s); `serverWork` client + store slice;
  WorkHome server mode (composer creates+starts, honest status list);
  ServerTaskThread (live runs, stop, answer box).

**P06 complete (T021, T022)** — plugins:
- Contracts + migration 0016 (`plugin_grant`, `plugin_receipt`,
  workspace `enabled_plugins`); the one registry with the two-gate
  check (workspace enablement AND per-thread grant AND not
  integration-required — precise reasons otherwise); dispatch executes
  library.search/attach over the Library service, documents.create
  validation, bounded CSV summary; every outcome is a bounded receipt
  (6 tests).

**T023 started**: MCP SDK `@modelcontextprotocol/sdk@1.32.2` installed
and verified (Client + StreamableHTTPClientTransport). The rest of
T023 (server config, encrypted auth, time-bounded transport) is NOT
started.

**Suites**: backend **340/340 across 39 files** (10 new this session);
frontend typecheck + the affected slices green (memory panel 4,
canonical 11, work 21, clients 14). One test-race fixed (waitForHeld
before releasing held provider streams — commit 68).

## Not finished (honest limits)

- **The 300-commit target is not reached (70 total).** The spec forbids
  padding commits to hit a number; each commit is a real, tested
  increment. Reaching 300 requires completing the remaining phases.
- T023 rest, T024, T025 (MCP); P08 connectors; P09 routines scheduler;
  P10 files/knowledge; P11 isolated execution (bash stays inert until
  then); P12 messaging; P13 full verification + visual QA; P14
  deployment. None started this session beyond the T023 SDK install.
- Same verification posture as session 1: fixture providers only, no
  live credentials.

## Next in dependency order

1. T023 (MCP config/auth/transport on the installed SDK) → T024
   (namespaced tools through the grants gate) → T025 (settings UI).
2. P09 routines (tables exist from migration 0011; scheduler + routes,
   wire to the worker from T013).
3. Then P08, P10-P12, P13-P14 per the ledger.

Commands: `cd backend && npm run typecheck && npm test`; frontend
`npm run typecheck && npm run lint && npm test`; worker
`npm run worker` (needs DATABASE_URL).
