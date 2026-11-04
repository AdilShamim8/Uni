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
| N007 separate readiness states | implemented-verified | N001-N006 | packages/contracts/src/providers.ts, backend/src/modules/providers/providers.service.ts, backend/tests/providers-readiness.integration.test.ts, frontend/src/{services/connection/providerConnection.ts,services/api/serverProviders.ts,features/settings/{AccountSection,ProvidersSection,ReadinessStrip}.tsx} | Four-axis readiness (reachability/catalog/credential/generation) on every test/discovery response, computed from what the check PROVED (401 → reachable + credential fail; 404 discovery → reachable + catalog fail + credential unknown; network failure → reachability alone); shared ReadinessStrip under every result; 8-test backend suite over real sockets + 7 frontend unit cases | `9b895b5ab` | pushed, merged to main via PR #47 | — |
| N009 bounded catalog and probe bodies | implemented-verified | N007 | backend/src/modules/providers/providers.service.ts, backend/tests/providers-body-limits.test.ts, frontend/src/services/connection/providerConnection.ts | Catalog body hard-bounded at 2 MB, /key at 64 KB: content-length checked BEFORE reading (stream cancelled), streaming-past-cap cancelled the moment it crosses; both sides identical; refused body = honest 'too large', nothing adopted/persisted; non-JSON 200 = honest 'not a readable model list' | `007d5457c` | pushed, merged to main via PR #47 | — |
| F002 (found follow-up) usage-append race fix | implemented-verified | — | backend/src/modules/runs/runs.service.ts, backend/tests/runs.integration.test.ts | Found while testing at HEAD: the e2e run test was flaky (1 failure in 2 fresh-clone runs) — the usage event append raced the pending delta flush chain (both SELECT max+1, PK collision → provider_error after success OR silently lost deltas). Fix: await the flush chain before appending usage. Regression test asserts strictly-increasing sequences, usage after last delta, deltas reconstructing outputText, token counts surviving | `4012b123c` | pushed, verified remotely | — |
| N010 manual model setup | implemented-verified | N004, PATCH contract already in backend | frontend/src/{services/api/serverProviders.ts,state/serverSessionStore.ts,features/settings/AccountSection.tsx}, frontend/tests/accountServer.test.tsx | Provider-row "Set model manually" (shown when no model exists) + destination-picker "Type a model id…"; PATCH persists the exact id without touching the catalog; manual model stays selectable (labeled '— set manually'); selection semantics: selected provider follows its own manual model, non-selected never moves the selection, no-selection + usable → first destination; 3 tests | `f5f32b363` | pushed, verified remotely | — |
| N011 searchable bounded model catalog | implemented-verified | N010 | frontend/src/features/settings/{SearchableModelPicker.tsx,AccountSection.tsx}, frontend/tests/accountServer.test.tsx | Above MODEL_PICKER_THRESHOLD (12) the destination Model control becomes a searchable picker: filter input, bounded 30-match display + honest '+N more' note, honest no-match state, Enter commits first match, manual entry one action away in the panel; native select stays below the threshold (N004/N005/N010 flows unchanged); 2 tests over a seeded 40-model catalog | `9278eed89` | pushed, verified remotely | — |
| N012 normalized connection-error classification | implemented-verified | N007, N009 | packages/contracts/src/providers.ts, backend/src/modules/providers/providers.service.ts, backend/tests/{providers-readiness.integration,providers-body-limits,providers-openrouter}.test.ts, frontend/src/{services/api/serverProviders.ts,services/connection/providerConnection.ts,features/settings/{providerErrors.ts,AccountSection,ProvidersSection}.tsx}, frontend/tests/{byok.test.ts,accountServer.test.tsx} | Ten-kind shared vocabulary (unreachable, endpoint-not-allowed, invalid-endpoint, no-credential, rejected-credential, catalog-unavailable, body-too-large, openrouter-key-unknown, cancelled, superseded); null = the only success shape; threaded through EVERY backend branch (route schema parse fails closed on a missing kind) + identical BYOK classification incl. client-only kinds; both surfaces render the label tag; assertions added across all affected suites | `326f78cba` | pushed, verified remotely | — |
| N013 capability-aware model choices | implemented-verified | — | frontend/src/{domain/types.ts,features/chat/TopBar.tsx,features/settings/ProvidersSection.tsx}, frontend/tests/modelPicker.test.tsx | Every model item lists what it advertises; capability filter row narrows the choice (only advertised capabilities offered → empty result impossible by construction); provider groups with nothing matching collapse; active chip toggles off; CAPABILITY_ORDER canonical in the domain (picker + editor chips can't drift); 4 tests over the seeded demo profiles | `28d12d8aa` | pushed, verified remotely | — |
| N014 preset refresh (live-probed) | implemented-verified | — | frontend/src/features/settings/{providerPresets.ts,ProvidersSection.tsx,freeModels.ts,FreeSetupGuide.tsx}, frontend/tests/{providerPresets.test.ts,settings.test.tsx,freeGuide.test.tsx,freeModels.test.ts} | Every endpoint probed LIVE this session (401/403/200/route-shaped = exists; failures excluded — api.liquid.ai/api/v1 dead → inference.liquid.ai/v1, Lambda/Requesty unreachable); 17 verified additions grow the catalog 21→38; Pollinations = first curated keyless HOSTED route (verified unauthenticated live completion) with a third FreeRoute variant; presets exported to providerPresets.ts with probe evidence; form copy derives its count; data-integrity tests pin the catalog shape | `469b13bbd` | pushed, verified remotely | Probe evidence is point-in-time (2026-11-03); re-probe before future catalog edits |
| N015 integrated provider journey | implemented-verified | N010, N011, existing empty-state CTA | frontend/src/{state/store.ts,features/settings/ProvidersSection.tsx,features/chat/ChatPage.tsx}, frontend/tests/{providerJourney.test.tsx,settings.test.tsx} | Connected provider card with models offers "Chat with {model}": one tap activates the exact first model, closes the dialog, and hands focus to the composer via ui.composerFocusAt (ChatPage owns the composer ref); journey test walks the WHOLE flow as one continuous session over real code paths, ending with a reply streamed through the REAL live adapter against an SSE completion; 2 tests | `efec167c1` | pushed, verified remotely | — |
| F003 (found follow-up) atomic event sequence assignment | implemented-verified | F002 (generalizes its serialization) | backend/src/modules/runs/runs.service.ts, backend/tests/runEvents-atomic.test.ts | appendEvent read+insert now inside ONE transaction holding pg_advisory_xact_lock(hash(runId)): concurrent same-run appenders serialize at the lock, never the PK; different runs never block each other; publication still post-durability. 3-test suite attacks the boundary directly (16 concurrent appends → distinct CONTIGUOUS sequences; two runs concurrently → both progress; raw appends never touch the run row). VERIFIED DISCRIMINATING: fails against the pre-fix implementation (unique-violation rejections, gaps), passes with the lock. RELABELED 2026-11-04: this commit shipped as "[N016]" but the original N016 is request fingerprinting — the advisory-lock work is a follow-up to F002 and now carries ID F003 | `c7a81d621` | pushed, verified remotely | — |
| N016 run request fingerprint | implemented-verified (2026-11-04 effort, `task/uni-next-release-300`) | F003 (sequence atomicity prerequisite) | backend/src/modules/runs/{requestFingerprint.ts,runs.service.ts}, backend/src/db/schema.ts, backend/drizzle/0009_*, backend/tests/runs-fingerprint.test.ts | Idempotency keys bound (migration 0009 column) to sha256 of the canonical EFFECTIVE request: conversation, answered user node, provider, effective model (explicit override or provider default at creation — never credentials). Same key + same input → one owned run reused with NO second provider invocation; different conversation/message/provider/model → typed 409; explicit model equal to default = SAME request; changed provider default makes omitted-model retry DIFFERENT; keys workspace-scoped (foreign workspace same key = own run); legacy NULL-fingerprint rows derive binding from their own columns. 9-test suite, DISCRIMINATING (6/9 fail pre-fix); backend 241/241 at the slice | `06ecca92f` | pushed, verified remotely (session 4; PR #48) | — |
| N017 concurrent run creation | implemented-verified (2026-11-04 effort) | N016 | backend/src/modules/runs/runs.service.ts, backend/src/lib/pgErrors.ts, backend/tests/runs-concurrent-create.test.ts | Same-key create race at the unique index: Postgres blocks the loser's insert until the winner commits, then THROWS 23505 (the old empty-returning fallback was dead code — loser raw-500'd). Now caught (through drizzle's .cause wrapping): loser reuses the winner's committed run (one run, ONE provider invocation — fake provider request counter) or gets the typed 409 when the effective request differs. 3-test concurrent HTTP suite, DISCRIMINATING (mixed-input race: raw 500 in 3/3 pre-fix runs); backend 244/244 at the slice | `5e7de0518` | pushed, verified remotely (session 4; PR #48) | — |
| N018 retry-safe user-node creation | implemented-verified (2026-11-04 effort) | N017 pattern, existing clientId unique index | backend/src/modules/conversations/conversations.service.ts, backend/src/lib/pgErrors.ts, backend/tests/conversations-node-idempotency.test.ts | Concurrent same-clientId node posts no longer raw-500: the loser's aborted transaction is caught OUTSIDE the tx and resolved with exactly one lookup retry that replays the winner's node (reused:true, one node row); the retry cannot loop (row exists → lookup returns before insert); different clientIds never conflict; sequential lost-response retry already worked and is pinned. 3-test suite, DISCRIMINATING (concurrent case raw-500s pre-fix); backend 247/247 at the slice | `4c4c28345` | pushed, verified remotely (session 4; PR #48) | — |
| N073 CI coverage through the task branch's draft PR | implemented-verified | — (no code change; process evidence) | none (draft PR #46 opened against main; existing workflows) | Draft PR #46 triggers all three required jobs for the pushed SHA `b486defec`: Contracts **success**, Backend (typecheck + integration tests) **success**, Frontend (typecheck + tests) **success**, plus Frontend-CI verify **success** — inspected via the check-runs API after completion | — (PR #46, checks on `b486defec`) | branch pushed; PR open (draft, not merged per the working agreement) | Ongoing: each future push to the branch re-runs these jobs; Gate A evidence checkpoint (N075) remains future work |

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

- Phase 2 remainder: original N016 request fingerprinting (reopened; see
  its row) and N017+ atomicity — the event-sequence guarantee delivered by
  F003 is a prerequisite slice, not the phase's completion.
- Phase 3 (contracts/modes), Phase 4 (normal server Chat).
- Deferred polish: server-side persisted selection (workspace settings
  API) once a settings surface exists; N075 Gate A evidence checkpoint.

## Session commit count

- Production-300 session 1: 5 implementation commits (F001, N001–N003,
  N004–N005, N006, N008) plus 1 checkpoint docs commit.
- Session 1.5 (same day, after the checkpoint): N007 and N009 pushed on
  the task branch, merged to main via PR #47.
- Production-300 session 2 (this checkpoint): **8 implementation
  commits** (F002, N010, N011, N012, N013, N014, N015 + the commit then
  labelled N016, now F003) plus this docs commit — every one pushed
  individually to main and verified by `git ls-remote` SHA comparison
  against local HEAD after each push.
- Corrected count (2026-11-04; the previous "24 IDs" claim was arithmetically
  wrong — its own list names 19): **18 code-backed implemented IDs**
  (F001, F002, F003, N001–N015) plus **N073 as process evidence only**
  (no implementation SHA). Git between START_SHA and UPDATE_START_SHA:
  18 non-merge commits (15 implementation + 3 docs) + 2 merges (PRs #46/#47).
- 2026-11-04 update effort: reopened at UPDATE_START_SHA
  `526b8cf0e089061ed274e1744ac4c3a8ee4006c5` on branch
  `task/uni-next-release-300` targeting 300 additional commits. New-work
  count of record: `docs/update-2026-11-04-commit-manifest.md`. Session 3
  delivered the effort-opening docs commit + original N016, N017, N018
  (backend 247/247); pushes were blocked by missing credentials (exact
  errors in verification.md). Session 4 (2026-11-04, same day) unblocked
  pushes with a provided credential: all five session-3 SHAs pushed ONE
  AT A TIME to the branch, each verified by `git ls-remote` SHA
  comparison, and draft PR #48 opened against main to expose CI;
  remote-check counters and this ledger's push states updated in the
  U2-006 docs commit.
