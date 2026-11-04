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
| U2-001 | N016 (ledger), N073 (arithmetic) | Open the 300-new effort: this manifest with binding counting rules; corrected ledger N016 mapping (advisory-lock commit `c7a81d621` relabeled follow-up F003; original N016 reopened pending); corrected arithmetic (18 code-backed rows + N073 process evidence; old claim said 24); fresh baseline in verification.md | This row + verification.md session-3 baseline table (contracts clean; backend 232/232; frontend 511/511) + ledger diff | `2ae0e5cb2` | pushed 2026-11-04 (session 4); `git ls-remote` shows `2ae0e5cb24da043bb2ec23d467769dda98ae903b` on the branch | draft PR #48 opened (session 4) | 299 |
| U2-002 | N016 | Run request fingerprinting: idempotency keys bound (migration 0009) to the canonical effective request — conversation, answered node, provider, effective model; same key + same input replays the one owned run with no second provider invocation; different input → typed 409; legacy NULL-fingerprint rows derive their binding from their own columns; keys stay workspace-scoped | 9-test suite over real app + fake provider + embedded PG; DISCRIMINATING: 6/9 fail against pre-fix service (all conflict cases + legacy-conflict + stored-fingerprint), 3 pass both sides; full backend gate typecheck/build clean 241/241 | `06ecca92f` | pushed 2026-11-04 (session 4); ls-remote `06ecca92f892a69a4c7fa30921ff9ad93f9e461a` | PR #48 | 298 |
| U2-003 | N017 | Conflict-safe concurrent run creation: same-key race at the unique index catches Postgres 23505 (thrown, not empty-returning) outside drizzle wrapping; loser reuses the winner's committed run (one run, ONE provider invocation) or gets the typed 409 from N016's binding; isUniqueViolation shared helper | 3-test suite firing genuinely concurrent HTTP creates; DISCRIMINATING over 3 pre-fix runs: mixed-input race failed 3/3 with a raw 500, identical-input 2/3 (third was replay-path timing luck); post-fix deterministic; backend gate 244/244 | `5e7de0518` | pushed 2026-11-04 (session 4); ls-remote `5e7de0518b6eb22a489396b6173865945685132c` | PR #48 | 297 |
| U2-004 | N018 | Retry-safe user-node creation: concurrent same-clientId posts at the (conversation_id, client_id) unique index no longer raw-500 — the loser's aborted transaction is caught outside and resolved with one lookup retry that replays the winner's node as reused; retry cannot loop; different clientIds never conflict | 3-test suite; DISCRIMINATING: concurrent test fails pre-fix with a raw 500, sequential-retry and distinct-id tests pass both sides; backend gate 247/247 | `4c4c28345` | pushed 2026-11-04 (session 4); ls-remote `4c4c28345914e24039d5cfe2e669eebba7e54d5b` | PR #48 | 296 |
| U2-005 | — (checkpoint) | Session-3 checkpoint: this row set, ledger N016–N018 rows, verification session-3 slice table + exact push error, handoff current-state | docs only; no code change | `99ea4affe` | pushed 2026-11-04 (session 4); ls-remote `99ea4affe089c8c04482c95584ae623f3b6df618` | PR #48 | 295 |
| U2-006 | — (docs) | Push unblocked (credential provided 2026-11-04, session 4): all five session-3 SHAs pushed ONE AT A TIME to `task/uni-next-release-300`, each verified immediately by `git ls-remote` SHA comparison (exact transcript in verification.md session-4); draft PR #48 opened against main to expose CI; manifest remote columns + counters updated, ledger push states updated, handoff current state updated | verification.md session-4 push table (5/5 SHA matches) + this row set | docs only; no code change | `810a776a6` | pushed, verified remotely (ls-remote `810a776a652189b51c4fb7c2b605cfc77f910ee9`) | PR #48: all four check-runs success on this SHA | 294 |
| U2-007 | N019 | Persistent client send identity (frontend): ONE operation id per logical send — reused across automatic network retries (bounded 3-attempt retry for the node and run creates on TRANSPORT failures only; ApiError surfaces immediately), manual re-press, and page reload (localStorage-backed, workspace+conversation scoped, same-content match, 24h TTL, bounded map); the id is the node clientId AND (`run-<opId>`) the run idempotency key; cleared when the client sees the run-create response (a resend after that is a fresh send); signIn/signUp/signOut clear records (initialize deliberately does not — reload must keep them) | 11-test suite; DISCRIMINATING against the pre-fix store: 5/11 fail (no auto-retry, fresh ids per send, old key format); lifecycle guards (success-clears, supersede, HTTP-no-retry, sign-out clear, TTL, workspace scoping) | `a3a614a14` | pushed, verified remotely (ls-remote `a3a614a146d66cd5742e785a0cbfd798618980de`) | PR #48: all check-runs success | 293 |
| U2-008 | N020 | Atomic active-run admission (backend): the workspace concurrency count and the run insert share ONE transaction serialized by a per-workspace advisory lock (hashtextextended, the F003 pattern) — concurrent creators see committed predecessors, the cap can never be oversubscribed; different workspaces never block each other; the critical section is count+insert (provider invocation stays post-commit); N017 same-key catch and replay-bypass unchanged | 3-test suite with a fake provider that HOLDS streams open (admitted runs stay running): 8 concurrent creates → exactly 2 admitted, 6 typed 429 rate_limited, 2 provider invocations, durable state matches; guards: other workspace unblocked, replay at cap 200 reused. DISCRIMINATING: 4/5 pre-fix runs failed in three distinct race shapes, 1/5 timing luck; post-fix 3/3 deterministic | `a14d65403` | pushed, verified remotely (ls-remote `a14d654033e4490d3788ff2771508615577b97df`) | PR #48: all check-runs success | 292 |
| U2-009 | N021 | Durable creation-rate accounting (backend): the per-minute limit is counted from the runs table itself (created_at, DB clock, trailing 60s) inside the admission transaction — visible to other processes and across restarts (the old process-local Map was not); only runs actually STARTED consume budget; replays bypass; migration 0010 adds run_workspace_created_idx | 4-test suite, each on its own workspace, DB-seeded creations modeling other-process/restart records: typed 429 with exact message and no row inserted; 60th passes/61st 429; 61s-old creations age out; replay at full window 200 reused + new send 429. DISCRIMINATING: 3/4 fail pre-fix (the Map sees none of them); age-out guard passes both sides | `34115b817` | pushed, verified remotely (ls-remote `34115b8177921770931c21b79b3f80d280377ade`) | PR #48: all check-runs success | 291 |
| U2-010 | N022 | Atomic run creation + started event (backend): the started event commits in the SAME transaction as the run row (sequence 1, no advisory lock needed — the run id is minted in the tx; the bus publish is skipped, subscribers cannot exist pre-response); a transient event-insert failure now rolls the WHOLE create back instead of orphaning a running row with zero events and no handle that the same-key retry would replay as interrupted | 2-test suite: a BEFORE INSERT trigger on run_event injects a real failure → 500 with NOTHING surviving (pre-fix: the orphan row survived) and the same key creates fresh after recovery (pre-fix: 200 reused of the stuck row); guard: started@sequence-1 in create response, replay, and durable rows. DISCRIMINATING: the rollback test fails pre-fix (expected 1 to be 0) | `9a7b312a7` | pushed, verified remotely (ls-remote `9a7b312a71dab619375fe23a4fb8001bca49b9d8`) | PR #48: all check-runs success (Contracts, Backend, Frontend, Vercel verify — confirmed before this checkpoint landed) | 290 |
| U2-011 | — (checkpoint) | Session-4 checkpoint: this row set, ledger N019–N022 rows, verification session-4 slice table + CI evidence per SHA, handoff current state | docs only; no code change | (this commit) | rides the branch (pushed with this row set) | PR #48 | 289 |

## Counters

- `new_commits`: 11 (4 docs/checkpoint + 7 implementation, counting this checkpoint)
- `new_implementation_commits`: 7
- `accepted_item_ids`: N016, N017, N018, N019, N020, N021, N022 (original queue IDs accepted this effort)
- `verified_existing_ids`: N001–N015, F001, F002, F003 (remapped advisory-lock work), N073 (process evidence only, no implementation SHA)
- `remote_present_commits`: 11 — every commit in this effort pushed individually and confirmed by `git ls-remote` SHA comparison (this checkpoint is pushed with this row set)
- successful push operations: 10 before this checkpoint (5 session-3 SHAs + U2-006 + four implementation slices), each followed by an ls-remote SHA verification; this checkpoint rides as the 11th

## Honest status notes

- **Push authentication unblocked 2026-11-04 (session 4)**: a credential
  was provided in-session; the five retained session-3 commits were
  pushed one at a time (never a bulk push), each verified by `git
  ls-remote` SHA comparison before the next. Draft PR #48 exposes the
  three required CI jobs plus Vercel verify for the branch; EVERY
  session-4 implementation SHA (U2-006 through N022) completed ALL
  check-runs green, confirmed via the check-runs API before this
  checkpoint landed.
- Execution order per the prompt and handoff: N016 (session 3), then
  N017, N018 (session 3), then N019 persistent client send identity
  and N020–N022 atomic admission (session 4). Next per handoff: the
  Step A live-destination blocked-state follow-up and the Step C
  server-chat connection items (N023+/N031+).
