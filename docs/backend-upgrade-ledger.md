# Backend upgrade ledger — P00–P14 (started 2026-11-10)

Task ledger for the backend-upgrade specification
(`Uni_Backend_Upgrade_Agent_Prompt.json`, prompt_version 1.0.0). One row
per task; status moves `todo → in_progress → done` only with fresh
evidence in the same change. `blocked` names the exact external
prerequisite. Verified-existing is only claimed after a fresh check in
this upgrade (not inherited from older docs).

## Baseline (T001/T002 evidence)

- Repository at branch `task/backend-upgrade-p00-p14`, created from
  `main` = `e50ac6a5ab10129650d671e61fbb9165cd296581` ("Merge pull
  request #59 from AdilShamim8/task/abacus-port-300") — identical to the
  researched target SHA, so every finding F01–F10 was checked against
  the same code the research read.
- Fresh baseline commands (Node v24.22.2, npm 11.19.1): contracts
  `npm ci && npm run build && npm run typecheck` — pass; backend
  `npm ci && npm run typecheck && npm test` — **297/297** across 30
  files (embedded PostgreSQL); backend `npm run build` — pass; frontend
  `npm ci && npm run typecheck && npm run lint` — pass; frontend
  `npm test -- --maxWorkers=1 --minWorkers=1` — recorded in
  `docs/verification.md` for this session.
- Findings reproduced in source at this SHA: F01 (client-chosen
  `rootDir`, shared `sessions/default`, contract regex admits `..`),
  F02 (fresh `pendingId` vs gate `requestId` mismatch in
  `agentRun.service.ts`), F03 (`zod.any()` tool declarations, plain
  text history, no tool-result messages), F04 (replace-all loop over
  modified string in `roster.ts` execEdit), F05 (SSE skips sequence 0,
  session stream ends on any run's terminal), F06 (unguarded insert
  after lookup, no terminal guard), F07 (host shell with cwd only),
  F08 (no agent API references under frontend/src), F09 (no routines
  module; tables only), F10 (sources.lock has no Abacus entries;
  UPSTREAM_NOTICE names `backend/src/modules/routines/scheduler.ts`
  which does not exist; roadmap B05+ says "Not started" despite the
  partial agent port; root AGENTS.md says React 18 while
  frontend/package.json declares React 19.3.1).

## Task status

| Task | Phase | Title | Status | Evidence / notes |
| --- | --- | --- | --- | --- |
| T001 | P00 | Establish the real starting point | done | Baseline section above; branch created; no reset, PR #59 preserved |
| T002 | P00 | Install from lockfiles + baseline checks | done | Commands and results in docs/verification.md session record |
| T003 | P00 | Task ledger + capability map | done | This file; capability map rows appended to docs/frontend-backend-map.md at each phase |
| T004 | P01 | F01 server-owned session roots + containment | done | commits 3-6: isValidRootDir + fail-closed join + sessions/<id> roots + lazy provisioning; 5 path tests + 6 integration cases green |
| T005 | P01 | F02 canonical permission IDs, atomic decisions | done | commits 7-9: row id IS requestId, ask persisted + waiter before publish, atomic claim bound to workspace+session+run+request; 5 integration tests green |
| T006 | P01 | F07 modes cannot cross tenants; shell disabled until isolation | done | commits 11-12: execBash refuses without UNI_AGENT_ISOLATED_EXECUTION, descriptor truthful, executor containment in all modes; 6 tests green |
| T007 | P02 | F03 real tool schemas + structured tool history | done | commit 8: SDK-native multi-step loop (stopWhen), real inputSchema per tool, tool errors visible from fullStream; provider request assertions green |
| T008 | P02 | Persisted transcripts + employee/memory linkage | done | commits 17-19: agent_turn transcript (migration 0012) + employee_id pin; second message sees first turn (provider-request asserted) |
| T009 | P02 | Truthful completion/budget/cancel outcomes | done | commits 20-22: usage summed across steps + usage event + run-row tokens (migration 0013); session returns to idle; budget/cancel truthful in F03 commit |
| T010 | P02 | F04 bounded edits/reads/fetch/search | done | commits 14-16: literal replace-all terminates; 2MB input caps on read/web_fetch; 6 tests green |
| T011 | P03 | F05 SSE cursor + run/session lifetimes | done | commits 23-25: after=-1 delivers sequence 0; runId-scoped stream ends only at its own terminal; serialized drains + backpressure + close cleanup |
| T012 | P03 | F06 atomic admission + terminal guards | done | commits 26-27: advisory-lock admission transaction (caps+insert+started event), unique-index recovery, one-way terminals; 3 tests green |
| T013 | P03 | Durable worker ownership (jobs module) | done | commits 28-30: pg-boss 10.4.2 + job_outbox (migration 0014) + worker.ts; boot reconciliation prevents zombie resume; payloads carry no credentials; 3 tests green |
| T014 | P04 | Typed mode-aware service adapters | done | commits 33-37: typed clients (serverEmployees/serverLibrary/serverAgents, 14 tests) + generation-guarded store state/actions loaded on sign-in, cleared on sign-out |
| T015 | P04 | Chat/employee surfaces use server runs | done | commit 38: EmployeeView opens the owned server conversation (find-or-create by agentId), renders the server thread with live run + honest errors, routes sends through sendServerMessage; local mode untouched (4/4 lifecycle tests) |
| T016 | P04 | Agents + memory panel wired to services | todo | |
| T017 | P04 | Library/Canvas canonical saves on server | todo | |
| T018 | P05 | Work domain/API on durable runs | todo | |
| T019 | P05 | WorkPage/TaskThread via adapters | todo | |
| T020 | P05 | Context/receipts in the durable run record | todo | |
| T021 | P06 | Plugin enablement + grants + receipts | todo | |
| T022 | P06 | Server document/data/Library tools | todo | |
| T023 | P07 | MCP server config + guarded transport | todo | |
| T024 | P07 | Namespaced MCP tools through grants | todo | |
| T025 | P07 | MCP settings UI in current surfaces | todo | |
| T026 | P08 | Connector registry + status API | todo | |
| T027 | P08 | GitHub connector | todo | |
| T028 | P08 | Google OAuth connectors | todo | |
| T029 | P08 | Slack/Notion/other adapters | todo | |
| T030 | P09 | Routine schedules + typed contracts | todo | |
| T031 | P09 | Scheduler slot-claiming + durable enqueue | todo | |
| T032 | P09 | Routine execution + unattended policy | todo | |
| T033 | P09 | Routine UI controls | todo | |
| T034 | P10 | Bounded uploads + owned storage | todo | |
| T035 | P10 | Text extraction (txt/md/csv → pdf/docx/…) | todo | |
| T036 | P10 | Workspace-scoped retrieval index | todo | |
| T037 | P10 | Genuine exportable deliverables | todo | |
| T038 | P11 | Isolated execution worker | todo | |
| T039 | P11 | Isolated browser adapter | todo | |
| T040 | P11 | Coding/browser tools in Work + employees | todo | |
| T041 | P12 | Messaging adapter core | todo | |
| T042 | P12 | Telegram/Discord/WhatsApp adapters | todo | |
| T043 | P12 | Messaging settings + sender controls | todo | |
| T044 | P13 | Full suites + controlled-fixture integration | todo | |
| T045 | P13 | Browser QA + visual preservation | todo | |
| T046 | P13 | Provenance + security review | todo | |
| T047 | P14 | Reproducible deployment config | todo | |
| T048 | P14 | Docs reconciled with final code | todo | |
| T049 | P14 | Coherent commits + reviewable handoff | todo | |

## Session end state (2026-11-10, this working session)

Completed phases: **P00, P01, P02, P03 complete** (T001–T013) and
**P04 partial** (T014 done, T015 done; T016/T017 not started this
session). All seven audited P0 defects F01–F07 are fixed with
regression coverage. Backend suite **330/330 across 36 files**;
frontend typecheck + lint + the server-surface test slice green
(employee lifecycle 4/4, server clients 14, account/fencing 45 total
in the server slice).

Honest limits of this session (why work stopped here):
- T016 (Agents memory panel wiring to server memory) and T017
  (Library/Canvas canonical saves) have typed clients + store actions
  landed (T014) but the UI surfaces are not yet switched to them.
- P05–P14 (durable Work, plugins, MCP, connectors, routines, files,
  isolation, messaging, final verification, deployment) are not
  started this session; their design anchors (worker, outbox,
  admission, SSE semantics) are in place from P03.
- The bash tool is inert on the host pending the P11 isolation worker
  (UNI_AGENT_ISOLATED_EXECUTION); this is deliberate (F07).
- No live provider/OAuth credentials were available; all verification
  is against fixture providers (embedded PostgreSQL + scripted
  OpenAI-compatible servers), as the spec directs for this stage.

Next actions, in dependency order: T016 → T017 (both build on the
landed clients), then P05 (Work on the durable worker — resumeAgentRun
+ the outbox are ready), then P09 routines (tables already exist from
migration 0011).

## Rules carried from the spec

- UI and local behaviors are preserved; only functional wiring changes.
- No fabricated live status; fixture vs live evidence separated.
- Additive migrations only; never rewrite deployed migration files.
- No arbitrary commit-count target; commits are coherent tested
  increments (the repository owner additionally asked that work be
  pushed commit-by-commit, which this branch follows).
