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
| 1 | RF-001 | effort | This manifest + counting rules + branch opened | docs | (this commit) | **push blocked** — see below |

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

## Counters

- `new_commits`: 1
- `new_implementation_commits`: 0
- `remote_present_commits`: 0 (push blocked — see above)
- Target: 500 new commits · remaining: 499
