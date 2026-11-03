# Production-300 ledger — Uni implementation effort

Started from base `START_SHA = 89acd256eceb0e3a9b6dc30da63677157c3fc2df`
(branch `main`, 2026-11-03). Working branch: `task/uni-production-300`.
Draft PR exposing checks: https://github.com/AdilShamim8/Uni/pull/46

Counting rule: every row below records the item state, the actual changed
paths, evidence, the commit SHA, and the remote push state. Old Wave-1
repairs (U001–U010) and U011 are **not** new commits — they are history.
`implemented-verified` rows are the only rows that count toward the 300.

## Baseline (fresh, this session, clean clone at START_SHA)

- contracts: `npm ci && npm run build && npm run typecheck` — clean.
- backend: `npm ci && npm run typecheck && npm run build` — clean;
  `npm test` = **206/206** (embedded PostgreSQL, non-root account).
- frontend: `npm test` = **474/474**, but **typecheck and lint FAILED**
  at START_SHA (see F001 below) — a genuine U011 regression, not a
  environment problem.
- `qa:live`: not yet run this session (needs a built backend on a port).

## Item ledger

| ID | State | Dependencies | Actual changed paths | Evidence | Commit SHA | Push state | Remaining limit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F001 (found follow-up) kind→protocol mapping fix | implemented-verified | — | frontend/src/domain/providerDescriptors.ts, frontend/src/services/connection/providerConnection.ts, frontend/tests/providerDescriptors.test.ts | Frontend typecheck+lint red at START_SHA (`ProviderKind` passed where `ProviderProtocol` expected); mapping now single-sourced in `protocolForKind`; 5-kind regression tests; typecheck/lint/build + targeted tests green | `bb09e74f8` | pushed, verified remotely | — |
| N001 explicit auth modes | implemented-verified | U011, F001 | packages/contracts/src/{providerDescriptors,providers}.ts, backend/src/db/schema.ts, backend/drizzle/0007_*, backend/src/modules/providers/providers.service.ts | none/bearer/native persisted with compatible defaults; backfill migration keeps keyed rows on their transport; keyless Anthropic rejected at the contract; 8-test integration suite | `72c8fad4c` | pushed, verified remotely | UI selector for bearer-vs-native on Anthropic gateways is future polish |
| N002 keyless probes + generation | implemented-verified | N001 | backend/src/modules/providers/providers.service.ts, backend/src/modules/runs/{modelClient,runs.service}.ts, backend/src/lib/providerUrls.ts | Wire-level proof: probes and SDK generation to a local runtime carry NO Authorization header (fake server rejects credential headers); keyed-without-key still refused | `72c8fad4c` | pushed, verified remotely | Hosted egress policy unchanged (guarded transport still applies) |
| N003 keyless setup in Settings | implemented-verified | N001, N002 | frontend/src/{services/connection/providerConnection.ts, services/live/liveChatAdapter.ts, state/store.ts, state/serverSessionStore.ts, services/api/serverProviders.ts, features/settings/{AccountSection,ProvidersSection}.tsx} | Connect with empty key works for keyless-capable protocols in both modes; keyless live generation sends no header; server providers can be created keyless | `72c8fad4c` | pushed, verified remotely | — |
| N004 explicit provider/model selection | implemented-verified | N001-N003 | frontend/src/state/serverSessionStore.ts, frontend/src/features/settings/AccountSection.tsx, frontend/src/services/api/serverProviders.ts | Selection stored by exact ids (persisted per workspace); picker UI; run body carries the exact providerId+modelId; adding/reordering never changes the destination (regression test) | `f7ad18c99` | pushed, verified remotely | Server-side persisted selection (workspace settings API) deferred until a settings surface exists |
| N005 deletion and selection repair | implemented-verified | N004 | same as N004 + delete API/service action + confirm dialog | Deleting the chosen provider clears the selection with an explicit notice; zero run calls after deletion (regression test caught and removed a real auto-fallback bug in the first draft) | `f7ad18c99` | pushed, verified remotely | — |
| N006 config revision identity | implemented-verified | N001 | backend/src/db/schema.ts, backend/drizzle/0008_*, backend/src/modules/providers/{providers.service,providers.routes}.ts | config_revision bumped on endpoint/auth/credential change; conditional apply discards late results; endpoint edit resets verification + withdraws catalog while label-only edits do not; slow-endpoint race regression | `0f42d56d2` | pushed, verified remotely | — |
| N008 probe request cancellation | implemented-verified | N006 (revision guard complements it) | backend/src/modules/providers/{providers.service,providers.routes}.ts, frontend/src/features/settings/ProvidersSection.tsx | Real-socket regression: client abort mid-probe destroys the outbound connection (fake provider records it), the row stays untested, cancelled checks write nothing; BYOK Cancel button + abort-on-unmount; OpenRouter /key honors the signal | `87b313dfd` | pushed, verified remotely | — |

## Verified-existing / skipped

- U011 descriptor registry: present at `8b748f1c1`; the frontend mirror
  is intentional (self-contained static build) until N031/N032 wire the
  contracts package into the frontend build. Not counted as new work.
- `.github/workflows/ci.yml` at START_SHA is VALID (`branches: [main]`)
  — an earlier suspicion of corruption was a terminal display artifact,
  verified at the byte level with `od -c` against the START_SHA blob.
  CI triggers on pushes to main and PRs targeting main; the task branch
  exposes checks through draft PR #46.

## Not started (next sessions, dependency order)

- N007 separate readiness states (reachability/catalog/credential/
  generation) — needs a DTO/UI readiness model; natural next item.
- N009 bounded catalog/probe bodies, N010 manual model setup,
  N011 searchable bounded catalog, N012 error normalization,
  N013 capability-aware choices, N014 preset refresh, N015 integrated
  provider journey — rest of Phase 1.
- Then Phase 2 (N016+ atomicity), Phase 3 (contracts/modes),
  Phase 4 (normal server Chat).

## Session commit count

- Meaningful new commits this session: **5** (F001, N001–N003, N004–N005,
  N006, N008) — all pushed individually and verified by `git ls-remote`
  SHA comparison against local HEAD after each push.
