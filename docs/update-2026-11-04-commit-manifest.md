# Update 2026-11-04 — 300 NEW commits manifest

This manifest tracks the **additional 300 meaningful commits** effort opened by
the 4 November 2026 agent prompt. It is the count of record for this effort;
`docs/production-300-ledger.md` remains the acceptance ledger for the
original 300-item queue and now carries the corrected N016 mapping.

## Immutable baseline

- `UPDATE_START_SHA = 526b8cf0e089061ed274e1744ac4c3a8ee4006c5`
  (branch `main` at checkout; verified identical to the prompt's inspected
  main; clean worktree; no concurrent upstream changes).
- Working branch: **`task/uni-next-release-300`**, created from that SHA.
  Every commit in this effort is pushed individually to this branch and
  verified by `git ls-remote` SHA comparison. Direct-to-main pushes are not
  used for this effort.
- Historical baseline (previous effort, preserved): START_SHA
  `89acd256eceb0e3a9b6dc30da63677157c3fc2df`. Between START_SHA and
  UPDATE_START_SHA git shows **18 non-merge commits (15 implementation +
  3 documentation) and 2 merge commits** (PRs #46, #47). None of these
  count toward the new 300.

## Counting rules (binding for this effort)

1. A commit counts when it is a new non-merge commit on
   `task/uni-next-release-300` after UPDATE_START_SHA, delivers a coherent
   independently reviewable improvement, carries its regression tests and
   related contracts, and is confirmed remotely present by SHA.
2. Documentation/checkpoint commits are counted in `new_commits` but
   tracked separately in `new_implementation_commits`; both counters are
   reported — never only the larger one. Merge commits, pre-existing work,
   re-pushes of existing SHAs, and CI/process bookkeeping rows without an
   implementation SHA never count as implementation commits.
3. `accepted_item_ids` counts original N-item IDs accepted **in this
   effort**. `verified_existing_ids` records items verified as already
   implemented at UPDATE_START_SHA (they are never recounted as new work).
4. Push auth: if pushes are blocked (no credential in this environment),
   commits are retained locally with exact errors recorded; they are not
   counted as remotely present until `git ls-remote` shows the SHA.

## Fresh baseline verification (recorded before any change)

Commands run on a fresh clone at UPDATE_START_SHA, this session, before the
first commit. Results recorded in `docs/verification.md` (session 3
section) — historical counts are never copied as fresh results.

| Area | Command | Result |
| --- | --- | --- |
| contracts | `npm ci && npm run build && npm run typecheck` | **PASS** (clean) |
| backend | `npm ci && npm run typecheck && npm run build` | **PASS** (clean) |
| backend | `npm test` | **232/232 PASS** (22 files, 52s, embedded PostgreSQL) |
| frontend | `npm ci && npm run typecheck && npm run lint && npm run build` | **PASS** (clean; pre-existing chunk-size warning only) |
| frontend | `npm run test -- --maxWorkers=1 --minWorkers=1` | **511/511 PASS** (69 files, 138s) |

## Change rows (one per actual new commit)

| Change ID | Original item IDs | User/system improvement | Acceptance evidence | Commit SHA | Exact remote check | CI | Remaining limit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| U2-001 | N016 (ledger), N073 (arithmetic) | Open the 300-new effort: this manifest with binding counting rules; corrected ledger N016 mapping (advisory-lock commit `c7a81d621` relabeled follow-up F003; original N016 reopened pending); corrected arithmetic (18 code-backed rows + N073 process evidence; old claim said 24); fresh baseline in verification.md | This row + verification.md session-3 baseline table (contracts clean; backend 232/232; frontend 511/511) + ledger diff | `2ae0e5cb2` | push blocked — no credential in this sandbox (exact error in verification.md) | blocked with push | 299 |
| U2-002 | N016 | Run request fingerprinting: idempotency keys bound (migration 0009) to the canonical effective request — conversation, answered node, provider, effective model; same key + same input replays the one owned run with no second provider invocation; different input → typed 409; legacy NULL-fingerprint rows derive their binding from their own columns; keys stay workspace-scoped | 9-test suite over real app + fake provider + embedded PG; DISCRIMINATING: 6/9 fail against pre-fix service (all conflict cases + legacy-conflict + stored-fingerprint), 3 pass both sides; full backend gate typecheck/build clean 241/241 | `06ecca92f` | push blocked (same) | blocked with push | 298 |
| U2-003 | N017 | Conflict-safe concurrent run creation: same-key race at the unique index catches Postgres 23505 (thrown, not empty-returning) outside drizzle wrapping; loser reuses the winner's committed run (one run, ONE provider invocation) or gets the typed 409 from N016's binding; isUniqueViolation shared helper | 3-test suite firing genuinely concurrent HTTP creates; DISCRIMINATING over 3 pre-fix runs: mixed-input race failed 3/3 with a raw 500, identical-input 2/3 (third was replay-path timing luck); post-fix deterministic; backend gate 244/244 | `5e7de0518` | push blocked (same) | blocked with push | 297 |
| U2-004 | N018 | Retry-safe user-node creation: concurrent same-clientId posts at the (conversation_id, client_id) unique index no longer raw-500 — the loser's aborted transaction is caught outside and resolved with one lookup retry that replays the winner's node as reused; retry cannot loop; different clientIds never conflict | 3-test suite; DISCRIMINATING: concurrent test fails pre-fix with a raw 500, sequential-retry and distinct-id tests pass both sides; backend gate 247/247 | `4c4c28345` | push blocked (same) | blocked with push | 296 |
| U2-005 | — (checkpoint) | Session-3 checkpoint: this row set, ledger N016–N018 rows, verification session-3 slice table + exact push error, handoff current-state | docs only; no code change | (this commit) | push blocked (same) | blocked with push | 295 |

## Counters

- `new_commits`: 5 (2 docs/checkpoint + 3 implementation, counting this checkpoint)
- `new_implementation_commits`: 3
- `accepted_item_ids`: N016, N017, N018 (original queue IDs accepted this effort)
- `verified_existing_ids`: N001–N015, F001, F002, F003 (remapped advisory-lock work), N073 (process evidence only, no implementation SHA)
- `remote_present_commits`: 0 — push authentication unavailable in this sandbox; all 5 commits retained on local `task/uni-next-release-300`; exact error recorded in verification.md
- successful push operations: 0

## Honest status notes

- **Push authentication is not available in this environment** (fresh
  sandbox; no stored credential). Commits are being retained on the local
  branch with exact errors recorded; remote counters stay at 0 until a
  credential is provided and each SHA is verified with `git ls-remote`.
- Execution order per the prompt: original N016 request fingerprinting,
  then N017 conflict-safe concurrent creation, then the Step B/C items.
