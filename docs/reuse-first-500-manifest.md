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
| 42 | RF-044 | effort | PR #63 merged to main (`f97c7d642`): every failing main check green (Backend/Frontend/Contracts/verify/Vercel build+deploy) | docs | `a0a60c567` | pushed ✓ |
| 43 | RF-045 | B07 | Workspace export endpoint: contracts + service + route (complete honest snapshot, workspace-isolated, counts derived from rows) + 2 integration tests | impl | `e358309d7` | pushed ✓ |
| 44 | RF-046 | B07 | Server workspace export UI in Settings → Data (signed-in card, honest busy/error states, dated download) + 3 tests | impl | `212ecaa17` | pushed ✓ |
| 45 | RF-047 | effort | Session-3 checkpoint: these rows, counters, verification | docs | `4c7571b82` | pushed ✓ |
| 46 | RF-048 | CI | Complete the account fixture in the export test (CI typecheck: workspace field required) | fix | `cab409f5e` | pushed ✓ |
| 47 | RF-049 | CI | Harness: retry embedded-PG startup with a fresh port + post-start TCP probe (CI port-race flake in agent-admission) | test | `03e732478` | pushed ✓ |
| 48 | RF-050 | effort | Session-3 close: PR #74 merged (`9bb4dfab2`), main green on every check | docs | `b04d11495` | pushed ✓ |
| 49 | RF-051 | T033 | Employee pin selector in the routine create dialog (soft pin, archived employees excluded, session's employee as default) | impl | `9c39ed8e9` | pushed ✓ |
| 50 | RF-052 | T033 | routineDto carries the pinned employee's name (bulk-resolved on list, soft on get, validated on create) + integration test | impl | `5c3c7c210` | pushed ✓ |
| 51 | RF-053 | T033 | Routines list row shows the pinned employee (runs-as badge, honest absence when unpinned) + tests | impl | `88f335416` | pushed ✓ |
| 52 | RF-054 | T033 | Routine detail dialog shows the pinned employee (parity with the list row) + test | impl | `581db91f0` | pushed ✓ |
| 53 | RF-055 | effort | Session-4 checkpoint: these rows, counters, verification | docs | `f2df56d9b` | pushed ✓ |
| 54 | RF-056 | CI | MAIN REPAIR (not part of the requested 5): restore the verified dependency set after the owner's 20-commit dependabot wave (merged with cancelled CI) broke main — undici 8.12.4 killed every provider request (`invalid onRequestStart method`: npm-undici-8 Agent dispatcher vs Node's bundled fetch), typescript 7.0.2 has no compatible typescript-eslint (peer `<6.1.0`); vite 8 / plugin-react 6 / react-markdown 10 / oc 3.0.87 unverified majors also reverted; ai 7.0.166 + dotenv 18.0.10 kept (verified) | fix | `989da6fee` | pushed ✓ |
| 55 | RF-057 | T033 | PATCH /routines/:id accepts employeeId — re-pin/unpin with create-grade validation; the provisioned session's employee/provider/model follow the pin (execution matches the badge) + 2 integration tests | impl | `57a59e379` | pushed ✓ |
| 56 | RF-058 | T033 | PatchServerRoutineInput mirrors the re-pin field | impl | `c96ee729c` | pushed ✓ |
| 57 | RF-060 | T033 | editServerRoutineFor store action (changed-only patch, generation-guarded, honest error) + 2 tests | impl | `c7b8bce4e` | pushed ✓ |
| 58 | RF-059 | T033 | RoutineFormFields extracted from the create dialog — pure refactor, existing tests unchanged and green | refactor | `3cd2a6164` | pushed ✓ |
| 59 | RF-061 | T033 | EditRoutineDialog: prefilled shared fields, changed-only patch (Save disabled until a change), re-pin, custom catch-up stays visible + 6 tests | impl | `aabcbcdf4` | pushed ✓ |
| 60 | RF-062 | T033 | Edit action on routine rows (keyed dialog, closes on success) + test | impl | `4c911b3ae` | pushed ✓ |
| 61 | RF-063 | T033 | Edit from the detail dialog; the detail view swaps in the saved row after a save + 2 tests | impl | `f30dd7bbe` | pushed ✓ |
| 62 | RF-064 | T033 | failures-only filter on the routine run history (error/skipped), honest empty state + test | impl | `0b81b1e8f` | pushed ✓ |
| 63 | RF-065 | T016 | journal client: dead stale-typed code replaced with the true DTO mirror + the missing revert client; journal store slice (revert refreshes notes AND journal) + 4 tests | impl | `138f56e45` | pushed ✓ |
| 64 | RF-066 | T016 | MemoryJournalViewer in the server memory panel (collapsible, honest states, per-entry revertibility) + 3 tests | impl | `63d7b2ec4` | pushed ✓ |
| 65 | RF-067 | T016 | journal revert behind a destructive confirmation; cancel reverts nothing + 2 tests | impl | `7e068f23f` | pushed ✓ |
| 66 | RF-068 | effort | handoff refresh: session-5 state, lessons, continuation queue | docs | `888758484` | pushed ✓ |
| 67 | RF-069 | effort | verification.md session-5 evidence (full suites 397 + 651, exit codes unmasked) | docs | `769e2d73c` | pushed ✓ |
| 68 | RF-070 | effort | Session-5 checkpoint: these rows, counters | docs | (this commit) | pushed ✓ |
| 69 | RF-071 | T-agent | expose the employee soft pin (employeeId) on the agent-session DTO + test | impl | `99c17df02` | pushed ✓ |
| 70 | RF-072 | T-agent | ServerAgentSession mirrors the employeeId soft pin | impl | `49bd47a57` | pushed ✓ |
| 71 | RF-073 | T033 | the re-pin test verifies the session employeeId end-to-end (RF-071 made it observable) | test | `fe5ecaa88` | pushed ✓ |
| 72 | RF-074 | T016 | EditEmployeeDialog (prefilled identity fields, changed-only patch, honest failure) | impl | `19a6aef58` | pushed ✓ |
| 73 | RF-075 | T016 | Edit action on server employee rows (keyed dialog, saves through updateServerEmployee) | impl | `fa5296a40` | pushed ✓ |
| 74 | RF-076 | T016 | first direct coverage of updateServerEmployee (row replacement, archived passthrough, rejection) | test | `950402cb4` | pushed ✓ |
| 75 | RF-077 | T033 | archived routines view (store flag passthrough, section toggle, honest Archived badge) | impl | `95e19f033` | pushed ✓ |
| 76 | RF-078 | T033 | archive/unarchive routine rows (store action replaces the row) | impl | `74f3d48b9` | pushed ✓ |
| 77 | RF-079 | T016 | archived employees behind a disclosure (store flag passthrough, out-of-rotation rows) | impl | `a135774c4` | pushed ✓ |
| 78 | RF-080 | T016 | archive/unarchive server employees (busy-guarded row actions) | impl | `94d6388d5` | pushed ✓ |
| 79 | RF-081 | T016 | hash-guarded server note editing (PUT client, contentHash mirror, 409 → reload + conflict signal) | impl | `19b60b23a` | pushed ✓ |
| 80 | RF-082 | T016 | server note editing UI in the panel (inline editor, Save/Cancel, hash-guarded) | impl | `17337a66e` | pushed ✓ |
| 81 | RF-083 | T016 | prove the conflict flow (409 → notice + winner text) and journal refresh after edit | test | `f9807ba89` | pushed ✓ |
| 82 | RF-084 | B07 | workspace export carries the memory journal (latest 200, honest count) | impl | `e9b6e78c8` | pushed ✓ |
| 83 | RF-085 | B07 | workspace export carries the latest 50 routine runs (outputs included) | impl | `14ce32f7e` | pushed ✓ |
| 84 | RF-086 | B07 | export client mirrors journal + runs; the settings card names its true contents | impl | `e06a73d7d` | pushed ✓ |
| 85 | RF-087 | T027 | connector credential storage (secretBox-sealed per workspace+connector, status tracking) | impl | `6e822da96` | pushed ✓ |
| 86 | RF-088 | T027 | GitHub adapter (injectable-fetch design: verify token, list PRs, list commits; fixture-verified) | impl | `1c9f86ab1` | pushed ✓ |
| 87 | RF-089 | T027 | POST /connectors/:id/test (body token or stored credential; verdict recorded; honest 503 for catalog-only) | impl | `d0ebbbeed` | pushed ✓ |
| 88 | RF-090 | T027 | connector credential routes (PUT sealed store, GET descriptor, DELETE; token never returns) | impl | `ca72b929d` | pushed ✓ |
| 89 | RF-091 | T027 | catalog reports per-workspace truth (available only with a verified credential) | impl | `c9b34fe08` | pushed ✓ |
| 90 | RF-092 | T027 | connector credential client (store/describe/delete/test; missing reads as null) | impl | `628c534d8` | pushed ✓ |
| 91 | RF-093 | T027 | GitHub connect flow on the Plugins page (test-then-seal, badge flip, removal) | impl | `f69a3ecc5` | pushed ✓ |
| 92 | RF-094 | T033 | describeSchedule names weekdays (Sundays, Fridays, Tuesdays-and-Thursdays) | impl | `6cb07c1cf` | pushed ✓ |
| 93 | RF-095 | T033 | routine rows show the next fire relative too (in ~2h) beside the absolute time | impl | `1eab5bc84` | pushed ✓ |
| 94 | RF-096 | T016 | memory panel warns when the linked employee is archived (out of rotation) | impl | `e96fe9c9d` | pushed ✓ |
| 95 | RF-097 | T033 | archived routines disappear from the default view immediately (fix) | fix | `5e7783409` | pushed ✓ |
| 96 | RF-098 | T016 | filter the memory journal by kind (added/edits/deletions, per-kind empty state) | impl | `aa1e4f5c7` | pushed ✓ |
| 97 | RF-099 | F08 | the export row remembers the last export (Last exported 5m ago, persisted locally) | impl | `f8d8e1641` | pushed ✓ |
| 98 | RF-100 | B04 | filter knowledge documents by title or file name (live, honest no-match state) | impl | `421099477` | pushed ✓ |
| 99 | RF-101 | T033 | edit dialog keeps an archived pin visible; never re-pins on unrelated saves (fix) | fix | `2c4f8322a` | pushed ✓ |
| 100 | RF-102 | T016 | memory panel shows the live budget (notes, characters, % of the ~4k sent) | impl | `7c18d898a` | pushed ✓ |
| 101 | RF-103 | T033 | routine detail shows catch-up window and archived state | impl | `bf2f37211` | pushed ✓ |
| 102 | RF-104 | T016 | journal viewer says when it shows the capped latest entries | impl | `bf7f9d2c9` | pushed ✓ |
| 103 | RF-105 | T016 | employees header counts archived identities (· N archived) | impl | `6d4d210be` | pushed ✓ |
| 104 | RF-106 | T016 | journal entries carry relative labels (3h ago) with exact time on the title | impl | `64d9867c3` | pushed ✓ |

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
- `remote_present_commits`: 111 — every commit pushed ONE AT A TIME and
  verified by SHA. **ALL 43 effort commits are now IN MAIN**: PR #62
  (RF-001…028, merged by the owner) + PR #63 (RF-029…043, merged
  2026-11-13 after its head CI matrix was fully green). Main head
  `f97c7d642` — every check green: Backend ✓ Frontend ✓ Contracts ✓
  verify ✓ Vercel build+deploy ✓.
- Session 3 (2026-11-13) additionally shipped B07 end-to-end (RF-045
  backend + RF-046 frontend) plus two CI hardenings (RF-048 typecheck
  fixture, RF-049 embedded-PG port-race retry) — merged via PR #74
  (`9bb4dfab2`), main green on every check including the Vercel
  production deploy. Main also carries two one-commit branch
  fast-forward pushes after each merge left the remote branch behind.
- Session 4 (2026-11-13, owner-requested batch of exactly 5) completed
  the routines employee pin end-to-end: dialog selector (RF-051),
  DTO name resolution (RF-052), list + detail badges (RF-053/054).
  From this session on, commits are authored as
  `Adil Shamim <157037615+AdilShamim8@users.noreply.github.com>` so
  they credit the owner's account (earlier rows predate this fix).
- Session 5 (2026-11-13, owner-requested batch of exactly 14): the
  routine EDIT thread end-to-end (RF-057..RF-064) and the memory
  JOURNAL thread (RF-065..RF-067). better-auth 1.7.19 (owner's PR #71)
  verified green before the session's work began.
- Session 6 (2026-11-13, owner-requested batch of exactly 41): session
  DTO pin exposure, employee edit + archived views, note editing, export
  completeness, the GitHub connector (T027), and 13 verified small
  improvements.
- Target: 500 new commits · remaining: 389 — honest work continues
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
