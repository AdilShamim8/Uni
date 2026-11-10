# Handoff — backend upgrade P00–P04 (2026-11-10 session)

Branch `task/backend-upgrade-p00-p14` (39 commits, each pushed and
ls-remote-verified individually). Base: `e50ac6a5` (= researched SHA).

## Done and verified this session

**P00 baseline (T001–T003)**: fresh clone/install/typecheck/tests of
all three packages at the base SHA — contracts build+typecheck,
backend 297/297, frontend typecheck/lint/522 tests — recorded in
`docs/verification.md`. Task ledger `docs/backend-upgrade-ledger.md`
created; every finding F01–F10 reproduced in source before fixing.

**P01 — tenant/permission correctness (T004–T006)**:
- F01 session roots: contract `isValidRootDir`, fail-closed runtime
  join (`UnsafeRootDirError`), server-owned `sessions/<sessionId>`
  roots (no shared `sessions/default`), lazy provisioning,
  cross-workspace symlink containment tested.
- F02 permission ids: the persisted ask's id IS the emitted
  requestId; ask persisted + waiter registered before publish;
  decisions claimed atomically bound to workspace+session+run+request.
- F07 host shell: `execBash` refuses without an isolated execution
  worker (`UNI_AGENT_ISOLATED_EXECUTION`), in every mode; descriptor
  says so honestly (`available: false`).

**P02 — engine correctness (T007–T010)**:
- F03 tool loop: SDK-native multi-step `streamText` (`stopWhen`),
  real zod input schemas (was `zod.any()`), tool results reach the
  next model request as structured messages, tool errors visible.
- F04 bounded tools: literal replace-all terminates (split/join, no
  re-search loop); 2 MB input caps on read/web_fetch with streamed
  truncation.
- T008 transcript: `agent_turn` table (migration 0012), second
  message sees the first turn (provider-request asserted);
  `employee_id` soft pin resolving instructions into the run prompt.
- T009 outcomes: usage summed across steps → usage event + run-row
  tokens (migration 0013); session returns to idle; budget exhaustion
  reports `tool_round_budget_exhausted`; cancel keeps partial text.

**P03 — durability (T011–T013)**:
- F05 SSE: `after=-1` delivers sequence 0; `runId`-scoped streams end
  only at their own run's terminal; serialized drains; backpressure;
  cleanup on close; schema-validated cursor.
- F06 admission: one advisory-lock transaction (concurrency + rate +
  insert + started event); unique-index recovery for concurrent
  same-key creates; one-way terminal transitions.
- T013 durable worker: pg-boss 10.4.2 installed; `job_outbox`
  (migration 0014) closes the run-row/queue gap transactionally;
  `src/worker.ts` (`npm run worker`) with boot reconciliation that
  prevents zombie resume; payloads carry identifiers only.

**P04 partial — UI wiring (T014–T015)**:
- T014: typed clients `serverEmployees.ts`, `serverLibrary.ts`,
  `serverAgents.ts` (14 tests) + generation-guarded store state and
  actions, loaded on sign-in, cleared on sign-out.
- T015: EmployeeView opens the employee's owned server conversation
  (find-or-create by agentId), renders the server thread (live run,
  honest errors), routes sends through `sendServerMessage`; local
  mode untouched (lifecycle tests 4/4).

**Suites**: backend **330/330 across 36 files** (was 297 — 33 new);
frontend typecheck + lint clean; server-surface slice green.

## Not finished (honest limits)

- T016 (memory panel → server memory) and T017 (Library/Canvas →
  server canonical saves): clients and store actions landed in T014,
  UI surfaces not yet switched.
- P05–P14 not started this session. Design anchors are in place
  (worker, outbox, resumeAgentRun, admission, SSE semantics).
- Bash tool deliberately inert pending P11 isolation.
- All verification against fixture providers (embedded PostgreSQL +
  scripted OpenAI-compatible servers); no live credentials exist here
  — the spec's required posture for this stage.

## Next in dependency order

1. T016, T017 (build on landed clients).
2. P05 Work on the durable worker (resumeAgentRun + outbox ready).
3. P09 routines (tables exist from migration 0011; scheduler + routes
   + tests needed, then wire to P05's worker).
4. Then P06–P08, P10–P12, P13–P14 per the ledger.

Commands: `cd backend && npm run typecheck && npm test`; `cd frontend
&& npm run typecheck && npm run lint && npm test`; worker:
`cd backend && npm run worker` (needs DATABASE_URL).
