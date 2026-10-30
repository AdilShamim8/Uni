# handoff.md — resumption checkpoint

Keep short and factual: current commit, completed gate, exact commands and
results, unresolved problems, environment blockers, next action.

## Current state (updated 2026-10-30, free-worldwide wave complete)

- **Branch:** `main` — this commit is the 376th. All 14 wave commits
  were pushed one at a time per working agreement.
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
