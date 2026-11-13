# Reuse-first 500 — effort manifest

This manifest tracks the effort opened by the 12 November 2026 agent
prompt (`Uni_Reuse_First_UI_and_Backend_Agent_Prompt.md`): assemble Uni
into one polished, functional AI workspace using a reuse-first strategy
(existing implementation first, then maintained packages, then focused
adapted components), with the product UI as the highest priority. The
repository owner additionally set a **500-new-commits** goal for this
effort and asked that every commit be pushed one at a time, never in a
bulk push. This file is the count of record for the effort.

## Immutable baseline

- `REUSE_START_SHA = a84aac2b06d91a00699315ed28409bdd6f9e1b84`
  (branch `main` at checkout; identical to `origin/main` at clone time
  and to the prompt's researched remote HEAD — the merge of PR #61,
  `task/backend-upgrade-p00-p14`, P00–P07 complete). No reset; all prior
  efforts' baselines and ledgers are preserved and never recounted here.
- Working branch: **`task/reuse-first-500`**, created from that SHA.
  Every commit is pushed individually to this branch and verified by
  `git ls-remote` SHA comparison. Direct-to-main pushes are not used for
  this effort. A draft PR exposes CI for the branch.
- Prior efforts of record (not reset, not recounted):
  - `docs/production-300-ledger.md` (original 300 queue, START_SHA
    `89acd256e`) — 18 code-backed IDs accepted, closed out through
    PRs #46/#47 and main pushes.
  - `docs/update-2026-11-04-commit-manifest.md` (2026-11-04 +300 effort,
    UPDATE_START_SHA `526b8cf0e`, branch `task/uni-next-release-300`,
    PR #48) — 6 commits recorded there.
  - `docs/update-2026-11-08-abacus-port-manifest.md` (2026-11-08 abacus
    port, branch `task/abacus-port-300`, PR #59 merged).
  - `docs/backend-upgrade-ledger.md` (2026-11-10 backend upgrade P00–P14,
    branch `task/backend-upgrade-p00-p14`, PR #61 merged) — 87 commits,
    T001–T025 done, T026–T049 open and inherited as input to this
    effort's queue.

## Counting rules (binding, carried from the 2026-11-04 manifest)

1. A commit counts when it is a new non-merge commit on
   `task/reuse-first-500` after REUSE_START_SHA, delivers a coherent
   independently reviewable improvement, carries its regression tests
   and related contracts where the change is code, and is confirmed
   remotely present by SHA.
2. Documentation/checkpoint commits count in `new_commits` but are
   tracked separately in `new_implementation_commits`; both counters
   are always reported together.
3. The 500 goal is met by decomposing the prompt's phases into the
   smallest coherent reviewable slices (one behavior, component, route,
   test group, or doc section per commit) — never by empty commits,
   formatting churn, split lines, or repeated work. If the queue runs
   out of honest work before 500, the effort stops and says so.
4. Baseline counts: this effort starts from 0 new commits; the 500
   target is entirely new work after REUSE_START_SHA.

## Verification discipline (per prompt §11, reconciled for pace)

- Per code commit: targeted checks for the touched surface (backend
  `npm run typecheck` + affected test files; frontend `npm run
  typecheck` + `npm run lint` + affected test files). Full suites run
  at milestones recorded in `docs/verification.md`, and GitHub Actions
  runs the full matrix on every pushed SHA through the draft PR
  (intermediate runs are cancelled by the workflow's concurrency group;
  the milestone and head-commit runs are the evidence of record).
- Full local gates (contracts build+typecheck; backend
  typecheck+build+full tests; frontend typecheck+lint+build+full tests)
  run at: effort open (baseline), each phase boundary, and effort close.

## Change rows (one per actual new commit)

| # | ID | Scope | Summary | Type | Commit | Remote check |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | RF-001 | effort | Manifest + counting rules + branch opened | docs | `ceacca6ee` | push blocked (credential) |
| 2 | RF-002 | effort | Foundation decision: retain Uni base — evidence tables (`docs/reuse-foundation-decision.md`) | docs | `768a10ed1` | push blocked |
| 3 | RF-003 | effort | Baseline evidence: 346 backend + 544 frontend green at the baseline SHA | docs | `9d76d9aea` | push blocked |
| 4 | RF-004 | effort | Capability matrix current-state audit (`docs/reuse-capability-matrix.md`) | docs | `665d2347e` | push blocked |
| 5 | RF-005 | Phase B | Chat surface mode (local/server) in the workspace UI store + 5 tests | impl | `fc6468aa6` | push blocked |
| 6 | RF-006 | Phase B | Extracted `ServerDestinationPicker` (N004/N005/N010/N011 semantics) for reuse; Account surface refactored onto it (18/18 accountServer) | impl | `ac4b1920e` | push blocked |
| 7 | RF-007 | Phase B | `ServerTranscript` (active-branch highlight, live-run states, honest errors) + 7 tests | impl | `3f74d780b` | push blocked |
| 8 | RF-008 | Phase B | `ServerChatComposer` (destination, send/stop, send-key preference, honest no-provider state) + 7 tests | impl | `0eab9d2b4` | push blocked |
| 9 | RF-009 | Phase B | `ServerChatPage` + `/sc` routes (index, open thread, signed-out prompt) + 6 tests incl. app route registration | impl | `9c7da8a1b` | push blocked |
| 10 | RF-010 | Phase B | `activePathIds` moved to a pure model module (lint/fast-refresh fix) | impl | `014e6b54b` | push blocked |
| 11 | RF-011 | Phase B | Sidebar server chat mode: Local/Server toggle (signed-in), server conversation list, server new-chat + 5 tests | impl | `ae8f98bfc` | push blocked |
| 12 | RF-012 | Phase B | Explicit sign-out resets chat mode to local (unreachable backend keeps the preference) + 2 tests | impl | `304a12991` | push blocked |
| 13 | RF-013 | Phase B | End-to-end server chat journey test (send → node → run → SSE → terminal → persisted node; network-failure honesty) + provider loading fix in the surface | impl | `07bdb3095` | push blocked |
| 14 | RF-014 | Phase C1 | Server employee roster on the Agents page (read-only, linked-profile threads, honest not-linked) + 5 tests | impl | `ec44c27b0` | push blocked |
| 15 | RF-015 | Phase C2 | Server artifacts section on the Library page (preview, provenance, version counts) + 4 tests | impl | `d78fa707f` | push blocked |
| 16 | RF-016 | C3 | Routine contracts: schedule vocabulary, DTOs, create/patch, run records (`contracts/routines.ts`) | impl | `25dd68c25` | push blocked |
| 17 | RF-017 | C3 | Pure 5-field cron evaluator (parser, matcher, bounded next-fire) + 13 tests | impl | `67dcccf6e` | push blocked |
| 18 | RF-018 | C3 | Routine CRUD service + routes (workspace scoping, session ownership, cron validation) + 6 integration tests | impl | `be05f7ad0` | push blocked |
| 19 | RF-019 | C3 | Scheduler tick: slot claiming, bounded catch-up policy, unique-index idempotence + 12 tests | impl | `5aa7b9ef8` | push blocked |
| 20 | RF-020 | C3 | Routine execution design: provisioned UNATTENDED read-only sessions (never interactive perms), employee pins, terminal sync, migration 0018; CRUD/scheduler tests updated (7+12) | impl | `6372bd7c9` | push blocked |
| 21 | RF-021 | C3 | Execution end-to-end test: tick → unattended run against a scripted provider → honest terminal sync (2 integration tests) | test | `a8c3ea698` | push blocked |
| 22 | RF-022 | C3 | Routine scheduler loop on the durable worker (minute tick, boot catch-up) | impl | `a8e8ec5b4` | push blocked |
| 23 | RF-023 | effort | Session checkpoint: manifest rows, verification milestone, handoff state | docs | `b85d6ffdb` | pushed ✓ |
| 24 | RF-026 | effort | Test import fix (AgentDatabase) completing the session-1 stack | impl | `2ecb8ba40` | pushed one-by-one ✓ |
| 25 | RF-027 | T033 | serverRoutines API client (typed routes, exact payloads, ApiError honesty) + 5 client tests | impl | `711651f2f` | pushed ✓ |
| 26 | RF-028 | T033 | Routines slice in the server session store (generation-guarded, honest errors) + 6 tests | impl | `2cb67f2fc` | pushed ✓ |
| 27 | RF-029 | T033 | RoutinesSection on the server Work surface (create dialog, pause/resume, delete confirm) + 7 tests | impl | `038789796` | pushed ✓ |
| 28 | RF-030 | T033 | nextFireAt preview computed by the backend's own evaluator (paused = null); contracts + tests | impl | `2ec43598d` | pushed ✓ |
| 29 | RF-031 | T033 | describeSchedule human labels + server-computed next-fire wiring + 5 tests | impl | `1b8a65008` | pushed ✓ |
| 30 | RF-032 | T033 | Routine detail dialog with honest run history (outputs, errors, empty state) + 4 tests | impl | `a7db2e557` | pushed ✓ |
| 31 | RF-033 | P08 | Connector catalog module + routes (honest unavailable statuses, session-scoped reads) + 4 integration tests | impl | `43f837550` | pushed ✓ |
| 32 | RF-034 | P08 | Connector catalog section on Plugins (not-connected cards, setup disclosure, docs links) + 5 tests | impl | `e2c9e5365` | pushed ✓ |
| 33 | RF-035 | CI | Lint fix: fetch mocks follow the repo's untyped vi.fn pattern | fix | `2e3de96ed` | pushed ✓ |
| 34 | RF-036 | P10 | Files & knowledge: documents with honest extraction + bounded lexical retrieval + migration 0019 + 7 integration tests | impl | `a83734101` | pushed ✓ |
| 35 | RF-037 | P10 | Server knowledge section on Library (text ingestion, honest binary refusal, search with excerpts) + 7 tests | impl | `9112b35f9` | pushed ✓ |
| 36 | RF-038 | T037 | knowledge_search agent tool over the files index (ungated read-only, unattended-allowed) + end-to-end engine test; routine roster gains the tool | impl | `4f08276c1` | pushed ✓ |
| 37 | RF-039 | CI | Lint fix: unused userEvent variable in the knowledge section test | fix | `7f201e415` | pushed ✓ |
| 38 | RF-040 | effort | Session-2 checkpoint: these rows, verification milestone, handoff | docs | `aaeca02e2` | pushed ✓ |
| 39 | RF-041 | Phase E | Truthfulness: capability-matrix rows for shipped capabilities, API-map additions, README test badge | docs | `92a239a71` | pushed ✓ |
| 40 | RF-042 | CI | Engine tests await full run quiescence (pool-teardown race that failed CI with all tests green) | test | `56be3e9d6` | pushed ✓ |
| 41 | RF-043 | effort | Close-out checkpoint: counters + CI-green evidence | docs | `81d613fd8` | pushed ✓ |
| 42 | RF-044 | effort | PR #63 merged to main (`f97c7d642`): every failing main check green (Backend/Frontend/Contracts/verify/Vercel build+deploy) | docs | (this commit) | pushed ✓ |

## Push blocker (recorded 2026-11-12, effort open)

The credential supplied with this effort's prompt is rejected by GitHub:

```
$ git push origin HEAD:refs/heads/task/reuse-first-500
remote: Invalid username or token. Password authentication is not supported for Git operations.
fatal: Authentication failed for 'https://github.com/AdilShamim8/Uni.git/'
$ curl -H "Authorization: token <supplied token>" https://api.github.com/user
{"message":"Bad credentials","status":"401"}
```

Read access to the public repository works (clone/fetch/ls-remote), so
the blocker is credential validity, not network reachability. Per the
prompt of record (§12), work continues locally: every slice is still
committed ONE AT A TIME on `task/reuse-first-500` with per-commit
verification, each push is retried at milestones, and no commit is
counted as `remote_present` until `git ls-remote` shows its SHA. When a
valid credential is provided, the retained commits are pushed one by
one in order (the procedure is scripted in
`scripts/commit-push-one.sh` at the workspace root, outside the repo).

## Counters (session 2 checkpoint, 2026-11-12)

- `new_commits`: 43 (RF-001…RF-043; 37 implementation/test/fix + 5 docs/effort)
- `new_implementation_commits`: 37
- `remote_present_commits`: 44 — every commit pushed ONE AT A TIME and
  verified by SHA. **ALL 43 effort commits are now IN MAIN**: PR #62
  (RF-001…028, merged by the owner) + PR #63 (RF-029…043, merged
  2026-11-13 after its head CI matrix was fully green). Main head
  `f97c7d642` — every check green: Backend ✓ Frontend ✓ Contracts ✓
  verify ✓ Vercel build+deploy ✓.
- Target: 500 new commits · remaining: 456 — honest work continues
  slice-by-slice; commits are never manufactured (prompt of record).

## Honest status at session close

- Completed this session: Phase A (foundation decision + matrix +
  baseline), Phase B core (unified server chat in the Chat surface:
  mode store, /sc routes, transcript, composer, sidebar, sign-out
  semantics, end-to-end journey test), C1 (Agents server roster), C2
  (Library server artifacts), C3 backend (routines T030–T032 complete:
  contracts, cron evaluator, CRUD, scheduler tick with slot semantics,
  unattended execution through the agent engine, terminal sync, worker
  loop).
- Per-commit verification: targeted suites green at each commit, and
  the session-close full-suite milestone is GREEN:
  **backend 380/380 across 46 files** (baseline 346 + 34 new),
  **frontend 587/587 across 81 files** (baseline 544 + 43 new).
  Exact per-commit table in verification.md.
- Not finished (next session, in order): T033 routine UI (frontend
  client + store slice + Work-surface section); P08 connectors
  (T026–T029); P10 files/knowledge (T034–T037); Phase B polish
  (screenshots desktop/mobile light/dark via the qa stack); P12
  messaging; Phase E verification/README; the remaining ~477 commits —
  the 500 target will not be met by one session; the queue above is
  the continuation plan.
- Push blocker (unchanged): a valid GitHub credential with repo write
  access is required from the owner.
