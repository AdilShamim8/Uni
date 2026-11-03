# Production-300 ledger — Uni implementation effort

Started from base `START_SHA = 89acd256eceb0e3a9b6dc30da63677157c3fc2df`
(branch `main`, 2026-11-03). Working branch: `task/uni-production-300`.

Counting rule: every row below records the item state, the actual changed
paths, evidence, the commit SHA, and the remote push state. Old Wave-1
repairs (U001–U010) and U011 are **not** new commits — they are history.
`implemented-verified` rows are the only rows that count toward the 300.

## Baseline (fresh, this session, clean clone at START_SHA)

- contracts: `npm ci && npm run build && npm run typecheck` — clean.
- backend: `npm ci && npm run typecheck && npm run build` — clean;
  `npm test` = **206/206** (embedded PostgreSQL, non-root).
- frontend: recorded below once the fresh install finished.
- `qa:live`: not yet run this session (requires built backend + ports).

## Item ledger

| ID | State | Dependencies | Actual changed paths | Evidence | Commit SHA | Push state | Remaining limit |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Notes

- U011 (descriptor registry) exists at `8b748f1c1`; frontend mirror at
  `frontend/src/domain/providerDescriptors.ts` is intentional until the
  contracts package is wired into the frontend build (N031/N032).
- `.github/workflows/ci.yml` at START_SHA has a corrupted trigger
  (`branches: ain]`) — CI never runs; fix belongs to N073.
