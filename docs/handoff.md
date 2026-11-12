## Current state (updated 2026-11-12, reuse-first-500 session 1 — push blocked, 23 local commits)

- **Branch:** `task/reuse-first-500` from `a84aac2b0` (= origin/main at
  clone). **23 commits, ALL LOCAL** — the supplied credential is dead
  (`Bad credentials` 401 from the API; `Invalid username or token` from
  git). First action with a valid credential: run
  `scripts/catch-up-push-one-by-one.sh` from the workspace scripts
  directory — it pushes every retained commit ONE AT A TIME with
  ls-remote verification between each. Count of record:
  `docs/reuse-first-500-manifest.md` (23/500).
- **Shipped this session:** (1) Phase A decision — retain Uni's
  foundation, documented with evidence in
  `docs/reuse-foundation-decision.md`; capability matrix opened at
  `docs/reuse-capability-matrix.md`. (2) Phase B core — the unified
  server chat surface: `features/chat/server/` (ServerChatPage on `/sc`
  routes, ServerTranscript, ServerChatComposer, extracted
  ServerDestinationPicker), sidebar Local/Server toggle with server
  conversation list, explicit sign-out reset, and an end-to-end journey
  test over the real store path with SSE frames and idempotency-key
  assertions. (3) Phase C1/C2 — server employee roster on Agents and
  server artifacts section on Library (read-only, honest states). (4)
  Phase C3 backend — routines complete end-to-end: contracts
  (`@uni/contracts` routines.ts), pure cron evaluator, CRUD
  (workspace-scoped, cron-validated), scheduler tick with slot claiming
  + bounded catch-up + unique-index idempotence, UNATTENDED read-only
  session provisioning (a scheduled task never holds interactive
  permissions), employee pins, terminal sync hook in the agent engine,
  and the worker minute-tick loop (migration 0018 hand-written,
  additive; drizzle journal updated accordingly).
- **Verification:** per-commit targeted suites all green (table in
  verification.md); frontend full suite 576/576 at the RF-013
  milestone; backend suite green at baseline and per touched suite.
- **Next executable slices (in order):** (1) T033 — routine UI:
  `services/api/serverRoutines.ts` client, serverSessionStore slice,
  and a Routines section on the server Work surface (create/pause/
  delete + run history); (2) full-suite milestone (backend + frontend)
  to certify RF-014–RF-022; (3) P08 connectors (T026–T029: registry,
  status API, fixture-verified GitHub, honest not-connected others);
  (4) P10 files/knowledge (T034–T037); (5) Phase B screenshot pass
  (desktop/mobile × light/dark) via `backend/scripts/browser-qa-stack.mjs`;
  (6) the manifest's remaining queue toward 500 — not reachable in one
  session; continue slice-by-slice.
- **Blockers:** no valid GitHub credential (pushes); no paid provider
  keys (live inference remains fixture-verified); no Docker daemon
  (P11 isolated execution stays honestly inert).

## Current state (updated 2026-11-04, session 4 — pushes unblocked, PR #48 open)

- **Push blocker cleared:** credential provided in-session. All five
  session-3 commits (`2ae0e5cb2`, `06ecca92f`, `5e7de0518`, `4c4c28345`,
  `99ea4affe`) pushed ONE AT A TIME to `task/uni-next-release-300`, each
  verified by `git ls-remote` SHA comparison (transcript in
  verification.md session 4). Draft **PR #48** opened against main to
  expose CI; at U2-006 commit time Contracts and Backend check-runs were
  **success** on the tip, Frontend in progress (final status goes in the
  session-4 checkpoint).
- **This session's recorded next steps (from session 3, unchanged):**
  (1) N019 persistent client send identity — frontend browser send path
  reuses ONE operation id (node clientId + run idempotency key) across
  network retries and reload, so N016–N018 server semantics actually
  protect real browser retries; (2) N020–N022 atomic admission — the
  active-run count is still a check-then-insert race and creation-rate
  accounting is still a process-local Map; (3) then Step A live-destination
  blocked-state follow-up and Step C server-chat connection items (N031+).
- **Count of record:** `docs/update-2026-11-04-commit-manifest.md` — after
  U2-006: 6 new commits (3 implementation), accepted N016/N017/N018,
  remaining toward the 300-new target: 294.

## Current state (updated 2026-11-04, session 3 — 300-new effort opened on task/uni-next-release-300)

- **Branch:** `task/uni-next-release-300` from UPDATE_START_SHA
  `526b8cf0e` (= main at checkout; no concurrent upstream changes).
  **5 commits (3 implementation + 2 docs), ALL LOCAL — pushes blocked: this fresh sandbox has no git
  credential** (`fatal: could not read Username for 'https://github.com'`).
  First action when a credential is available: push the branch, verify
  each SHA with `git ls-remote`, update the manifest remote columns.
- **Commits:** `2ae0e5cb2` docs effort opening (manifest + corrected N016
  ledger mapping → advisory-lock work relabeled F003, original N016
  reopened, arithmetic fixed to 18 code-backed + N073 process);
  `06ecca92f` **N016** request fingerprinting (migration 0009; same-key
  replay now bound to the canonical effective request, different input →
  typed 409; legacy rows derive from own columns); `5e7de0518` **N017**
  conflict-safe concurrent run creation (23505 caught through drizzle
  wrapping; one run, one provider invocation, typed 409 on input
  mismatch); `4c4c28345` **N018** retry-safe node creation (concurrent
  same-clientId posts resolve to one node; no raw 500).
- **Verification this session (fresh, at UPDATE_START_SHA and after each
  slice):** contracts clean; backend typecheck/build clean, final
  **247/247** (232 baseline + 9 N016 + 3 N017 + 3 N018); frontend
  typecheck/lint/build clean + **511/511** (untouched by these slices).
  Every new suite verified DISCRIMINATING against its pre-fix code —
  exact per-suite evidence in `docs/verification.md` (session 3).
- **Count of record:** `docs/update-2026-11-04-commit-manifest.md` —
  5 new commits (3 implementation + effort-opening docs + this
  checkpoint), accepted IDs N016/N017/N018; remaining toward the
  300-new target: 295.
- **Next executable steps (in order):** (1) push the branch once a
  credential exists; (2) N019 persistent client send identity (frontend:
  browser reuses one operation id across network retries and reload —
  builds on N018's clientId semantics); (3) N020–N022 atomic admission
  (the active-run count is still checked before insertion; creation-rate
  accounting is still a process-local map); (4) then the Step A
  live-destination blocked-state follow-up and the Step C server-chat
  connection items (N031+).
- **Blockers:** no git credential (pushes); no paid provider keys (live
  inference remains fake-server-verified over real sockets; qa:live not
  rerun — no routing change).

## Current state (updated 2026-11-03, production-300 session 2 — Phase 1 complete, Phase 2 opened)

- **Branch:** `main` — 9 commits this session (8 implementation + 1 docs
  checkpoint), each pushed individually and verified remotely
  (`git ls-remote` SHA match). HEAD after the docs commit.
- **Session scope shipped:** F002 (usage-append race fix — the baseline
  e2e flake, root-caused), N010 manual model setup, N011 searchable
  bounded model picker (threshold 12), N012 ten-kind errorKind
  vocabulary across contracts/backend/frontend, N013 capability-aware
  chat model picker (filter chips + per-model summaries), N014
  live-probed preset refresh (21→38, incl. keyless-hosted Pollinations),
  N015 integrated provider journey ("Chat with …" closes settings,
  activates the model, focuses the composer), N016 atomic event
  sequence assignment (pg_advisory_xact_lock per run; test verified
  discriminating against the pre-fix code).
- **Verification this session:** contracts build+typecheck clean;
  backend typecheck/build clean, **232/232** (228 baseline + 1 F002 +
  3 N016); frontend lint/typecheck/build clean, **511/511** (492
  baseline + 19 new across N010–N015). Full per-commit evidence table
  in `docs/verification.md` (session 2 section).
- **Ledger:** `docs/production-300-ledger.md` — rows through N016
  (24 implemented IDs counting toward the 300), including the N007/N009
  rows from session 1.5 (PR #47) that predated this checkpoint.
- **Next action:** Phase 2 remainder (N017+ atomicity items), then
  Phase 3 (contracts/modes) and Phase 4 (normal server Chat). Re-probe
  preset endpoints before future catalog edits (probe evidence is
  point-in-time 2026-11-03).
- **Blockers/limits:** no paid provider keys — live inference verified
  only through keyless Pollinations (real unauthenticated completion);
  everything else stays fake-server-verified over real sockets.
  `qa:live` not rerun (no routing change). Single-process run ownership
  unchanged (N016 fixed the event-sequence race; pg-boss durable
  execution is still B06).

## Current state (updated 2026-11-03, production-300 session 1)

- **Branch:** `task/uni-production-300` from main `89acd256e`
  (START_SHA). Draft PR exposing CI: #46. All commits pushed one at a
  time and verified remotely (`git ls-remote` SHA match).
- **New commits (5):** `bb09e74f8` frontend kind→protocol mapping fix
  (typecheck/lint were RED at START_SHA — a real U011 regression);
  `72c8fad4c` N001–N003 genuine keyless provider support (contracts +
  DB authMode with backfill migration 0007 + keyless probes/generation
  with wire-level no-Authorization-header proof + keyless setup in both
  Settings modes); `f7ad18c99` N004–N005 explicit server provider/model
  selection by exact ids with delete + explicit-unavailable states and
  no silent fallback; `0f42d56d2` N006 config revision identity
  (migration 0008, conditional apply discards late probe results,
  endpoint edits reset verification/catalog); `87b313dfd` N008
  abortable connection checks (client disconnect destroys the outbound
  socket; cancelled checks write nothing; BYOK Cancel button).
- **Verification this session:** contracts build+typecheck clean;
  backend typecheck/build clean, **217/217** (206 baseline + 11 new);
  frontend lint/typecheck/build clean, **482/482** (474 baseline + 8
  new); embedded PostgreSQL works under this non-root account.
- **Ledger:** `docs/production-300-ledger.md` (per-ID rows, evidence,
  push states, verified-existing notes, next-item order).
- **Next action:** N007 (separate readiness states: reachability /
  catalog / credential / generation in API and UI), then N009–N015 to
  finish Phase 1 providers. Resume command in the 300-guide.
- **Blockers/limits:** no real provider keys in this environment — all
  provider verification used deterministic fakes over real sockets
  (labeled as such; live inference verification pending). `qa:live` not
  rerun this session. Single-process run ownership unchanged (N121+).

# handoff.md — resumption checkpoint

Keep short and factual: current commit, completed gate, exact commands and
results, unresolved problems, environment blockers, next action.

## Current state (updated 2026-10-30, knowledge base wave complete)

- **Branch:** `main` — HEAD is the 383rd+ commit. All 8 wave commits
  were pushed one at a time per working agreement.
- **Wave scope shipped:** Wave 1 K1+K2 from PRODUCT_STRATEGY §6 — the
  knowledge base, local mode. (1) Domain module
  `frontend/src/domain/knowledgeBase.ts`: heading-aware chunking
  (#/##/### sections; oversized sections window with 160-char overlap
  and whole-word cuts; 400k-char/400-chunk hard caps reported honestly),
  a Unicode tokenizer with a small English stopword list, BM25-style
  lexical retrieval (postings + tf/idf, exact-phrase bonus, heading
  boost, per-doc cap 3, total cap 6, bounded snippets), and a cited
  context-block builder whose header states the retrieval method.
  (2) Store `state/knowledgeStore.ts` persisting under
  `universe:knowledge:v1` (quarantine policy like all slices; orphan
  chunks dropped on load; lazily rebuilt index). (3) Library Knowledge
  section (`features/library/KnowledgeSection.tsx`): paste/file ingest
  (.md/.txt/.csv/.json; PDFs honestly rejected), doc list, delete
  confirm, retrieval tester using the exact chat search. (4) Workspace
  backups carry the knowledge slice (optional for legacy backups;
  restore REPLACES — a legacy backup empties the base). (5) Chat
  integration: `knowledge` context item kind; the send path queries the
  outgoing message and appends only top cited excerpts to the system
  prompt; empty base → labeled unavailable state. (6) The composer
  toolbar gained a Context button (live count badge) — previously the
  inspector's Context tab had NO direct entry point in Chat.
- **Verification:** frontend 445/445 across 63 files (51 new), lint and
  both typechecks clean, production build clean; three fresh 1440×900
  screenshots from the real dev server; a fresh browser session ran the
  golden path with zero page/console errors. Backend untouched (117/117
  at last record; CI green on push). Full record in
  `docs/verification.md` (knowledge base wave section).
- **Notable facts for the next session:** retrieval is honestly
  keyword-based — embeddings (transformers.js local, provider optional)
  are the declared next step, and the UI says so; `resolveContextItems`
  takes an optional 4th arg `knowledgeDocCount` (CompareDialog call site
  unchanged); knowledge items resolve with `content: ''` so
  `buildContextBlock` skips them — the real block is built by the send
  path from `userNode.content`; `userEvent.upload` honors `accept`
  (test PDF rejection via `fireEvent.change`); knowledge documents are
  immutable in v1 (edit = delete + re-add, stated in the UI).
- **Next action candidates:** K1 embeddings upgrade (local
  transformers.js first; keep the lexical engine as the offline
  fallback and label which is active), K3 (agents/Work draw on the
  knowledge base through the plugins grant model), B05 server-side
  plugins with enforced grants, frontend surfaces for server
  employees/memory/library, README localization (R2).

## Prior state (2026-10-30, free-worldwide wave complete)

- **Branch:** `main` — the 376th commit closed that wave; all 14 of its
  commits were pushed one at a time per working agreement.
- **Wave scope shipped:** the $0 front door and the shareability
  flywheel. (1) Free-models catalog — ten curated $0 routes with honest
  limits, console links, steps, and starter models
  (`src/features/settings/freeModels.ts`). (2) Start-at-$0 hub leading
  the Providers section — one tap pre-fills the whole create form
  (`FreeModelsHub.tsx`; `creating` state now holds the seeded
  `ProviderDraft`). (3) Inline free-setup guides that follow the
  endpoint live, with a no-key variant for local routes
  (`FreeSetupGuide.tsx`). (4) Community gallery — six `uni.agent/v1`
  files in `src/features/agents/gallery/`, defensively normalized at
  load, installed through the standard `importAgentJson` path, honest
  already-added badges (`agentGallery.ts` + `GallerySection` in
  AgentsPage). (5) Share-page export — `conversationToShareHtml()`
  standalone HTML (escaped, no scripts, active path only) wired into
  TopBar and ConversationListItem menus.
- **Verification:** frontend 394/394 across 57 files (35 new), lint and
  both typechecks clean, production build clean; four fresh 1440×900
  screenshots captured from the real dev server via agent-browser with
  zero console/page errors. Backend untouched (117/117 at last record;
  CI green on push). Full record in `docs/verification.md`
  (free-worldwide wave section).
- **Notable facts for the next session:** hub cards are `<li>` with
  `<p>` labels by design — provider cards are the only `<article>`s and
  preset-chip tests query buttons like `/Groq/` while the hub is
  unmounted (it hides during creation), so keep that invariant;
  `VALID_TOOLS` is exported from `agentPortability` for shared
  validation; `tsconfig.json` now sets `resolveJsonModule`; gallery
  contribution path is `frontend/src/features/agents/gallery/` (JSON
  widened literals are normalized in `normalizeAgent`).
- **Next action candidates:** Wave 1 K1 (knowledge base / RAG — the
  top future priority per PRODUCT_STRATEGY §6), B05 server-side
  plugins with enforced grants, frontend surfaces for server
  employees/memory/library, README localization (R2).

## Prior state (2026-10-29, live QA sweep wave complete)

- **Branch:** `main` (commits pushed one at a time per working agreement).
- **Wave scope shipped:** the "test everything like a tester" pass.
  Commit `4a3b89f77` fixed a production-only auth bug the sweep found
  (Better Auth fell back to ONE shared rate-limit bucket per path
  because the Fastify bridge could not hand it the client IP — three
  sign-ups in 10 s locked the auth surface globally, and a client-set
  `X-Forwarded-For` was trusted verbatim, making per-IP limits
  bypassable). The bridge now resolves identity server-side
  (`AUTH_TRUSTED_PROXIES` IPs/CIDRs/`*`; spoofable forwarded headers
  stripped; private header to Better Auth), with optional
  `AUTH_RATE_LIMIT_MAX` for shared-egress deployments; 12 unit tests.
  Commit `6018ee565` added `npm run qa:live` — 119 checks over the
  compiled production server + fake provider on real sockets (auth,
  conversations/nodes, BYOK providers + SSRF guard, employees/memory,
  library m07 rules, importer, full run lifecycle incl. SSE, cancel,
  timeout, 401/500, concurrency cap, isolation). Commit `1a96a95d6`
  added `backend/scripts/browser-qa-stack.mjs` (one-command manual
  browser-QA stack) — used for a headless-browser golden-path pass:
  sign-up → server-provider BYOK (key encrypted, test connected, 2
  models discovered) → server chat → SSE-streamed reply → sign-out/in →
  transcript re-fetched; zero console/page errors.
- **Verification:** backend typecheck clean, 117/117 tests across 14
  files; `qa:live` 119/119; frontend lint/typecheck/build clean, 339/339
  tests across 48 files. Full record in `docs/verification.md` (live QA
  sweep wave section).
- **Notable facts for the next session:** delta events may coalesce a
  fast provider stream (per-chunk granularity proven via the cancel
  test); library canonical-save needs `linkedArtifactId`/`sourceMessageId`
  for the no-op/in-place paths (a bare save is Rule 4: fresh artifact);
  node idempotency is keyed by `clientId`; the browser-BYOK provider
  card is localStorage/direct-fetch by design (CORS note is honest).
- **Next action candidates:** B05+ (multimodal content, tool-calling),
  reasoning-model streaming fields, server-mode provider list beyond the
  Account section, README localization.

## Prior state (2026-10-29, CI repair wave complete)

- **Wave scope shipped:** backend CI green on GitHub Actions for the
  first time — portable test scratch root (`UNI_TEST_SCRATCH_ROOT` env
  override, `os.tmpdir()` fallback; the old hardcoded `/home/z/...`
  path broke every runner with `EACCES`), guarded afterAll teardowns,
  atomic run finalization, deterministic pre-cancel wait, and docs.
- **CI state at HEAD `4779ded6c` (run #107):** Contracts / Frontend /
  Backend all **success** on GitHub Actions; GitHub Pages build + deploy
  **success**. Vercel reports "Deployment rate limited — retry in 24
  hours": external account quota, auto-retries, documented — not a repo
  defect and not fixable from the repository.
- **Verification:** backend 105/105 across 13 files locally (runs suite
  3/3 stable), typecheck clean; guard behavior proven by forcing a
  beforeAll failure (single real error, no cascade). Full record in
  `docs/verification.md` (CI repair wave section).
- **Notable facts for the next session:** the backend CI job had NEVER
  been green on GitHub Actions before this wave (the hardcoded scratch
  path predates the dependabot merges); `mkdir` under `/proc` can HANG on
  Linux instead of failing — use a regular file path when forcing
  ENOTDIR-style failures; embedded-postgres works fine on ubuntu-latest
  runners with the tmpdir scratch root (~31s full suite).
- **Next action candidates:** B05+ (multimodal content, tool-calling),
  reasoning-model streaming fields, server-mode provider list in the
  frontend Account section, README localization.

## Prior state (2026-10-26, backend QA pass complete)

- **Branch:** `feat/qa-backend-verify` (off `main` after the B04 merge,
  PR #24; commits pushed one at a time per working agreement).
- **Completed gates:** B00, B01, B02, B03, B04, QA pass (103/103).
- **QA pass (2026-10-26):** memory-block route 404 consistency fix,
  SSE sentinel dead-code fix (prompt close on finalize), `.env.example`
  gained `BETTER_AUTH_SECRET`, new `backend/scripts/smoke-live.mjs`
  boots the compiled server in production mode over real HTTP (11/11).
  - B00: baseline, EmployeeView render-mutation fix, docs.
  - B01: Fastify app, env validation, health, Drizzle + migration 0000,
    docker-compose, `@uni/contracts`, frontend API client + dev proxy.
  - B02: Better Auth identity, workspaces, conversation CRUD + message
    tree, deliberate importer, frontend Account section.
  - B03: providers with encrypted credentials + SSRF guard; vendored
    OpenClaw repetition guard (provenance in
    `third_party/sources.lock.json`); runs module — idempotent create,
    server-side history, AI-SDK execution, persisted ordered events,
    SSE replay + live tail, durable cancel, honest terminals
    (complete/stopped/repetition_stopped/error), stuck-run
    reconciliation; frontend server chat surface in Account; B02
    messageCount bug fixed with regression test.
  - B04: employees, employee memory (vendored OpenMausBot kernel —
    redaction, hash-guarded writes, audit journal with revert, m07
    memory block, recall), the Library (artifacts + immutable versions,
    canonical save transaction), all wired into run execution.
- **Verification:** backend 101/101; frontend 321/321 (unchanged this
  gate); tsc/build clean (see `docs/verification.md` B03/B04 sections).
- **Stack:** Fastify + Drizzle + PostgreSQL + Better Auth + Zod +
  Vercel AI SDK (ai 7.0.153, openai-compatible 3.0.78, anthropic
  4.0.88) + pg-boss (from B06).

## Environment notes

- Development sandbox has no Docker daemon and no system PostgreSQL;
  DB-backed tests use `embedded-postgres` with disposable data dirs.
  The B03 browser E2E used a persistent embedded instance
  (`scripts/e2e-pg.mjs` pattern, kept outside the repo tree).
- Authenticated GitHub push is configured via the remote URL; the
  token is never committed.

## Next action

B05 per `docs/backend-roadmap.md`: server-side plugins with enforced
grants (port the frontend dispatcher's grant model to the server;
skills inspiration from OpenMausBot's skill-library). Then B06 (pg-boss
durable Work; define lease/crash semantics for in-flight runs), B07
(files, export/import completeness, optional routines — OpenMausBot's
webhook-ingress + routine designs are the reference), B08 (deployment +
security verification). A B04-followup polish item: frontend surfaces
for server employees/memory/library (the API is ready; the UI still
reads localStorage).

## Unresolved / watch list

- Single-process run execution by design for B03; B06 moves durable
  execution to pg-boss and must define lease/crash semantics for
  in-flight runs (the interrupted reconciliation is the stopgap).
- In-memory creation rate limit is per-process; revisit with B06.
- ChatPage unification (single surface for local + server
  conversations) is deliberate future polish; the Account surface is
  the complete B03 journey.
- Vite mixed static/dynamic import warning for `libraryStore.ts`
  (pre-existing; not a blocker).
