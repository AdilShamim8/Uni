# Progress Log — Uni Frontend

Living document. Updated per milestone stage so any agent can continue from here.

## Current state

- **Milestone:** Prompt 01 — chat interface and frontend foundation. **COMPLETE.**
- **Branch:** `feat/universe-chat-ui` (draft PR opened against `main`).
- **Stack:** Vite 5 + React 18 + TypeScript (strict) + Tailwind CSS 3 + zustand + react-router-dom; lucide-react icons; react-markdown + remark-gfm + rehype-highlight; Vitest + Testing Library. No backend, no real integrations.
- **Delivery:** 13 staged commits, each pushed individually (per user instruction), then a draft PR.

## Stage tracker

| # | Stage | Status |
| --- | --- | --- |
| 1 | Audit + planning docs | done (2026-10-17) |
| 2 | Toolchain scaffold | done |
| 3 | Design tokens + themes | done |
| 4 | Domain, mock adapter, store, persistence | done |
| 5 | UI primitives | done |
| 6 | App shell, sidebar, search, top bar | done |
| 7 | Composer, attachments, empty state | done |
| 8 | Messages, streaming, markdown, variants | done |
| 9 | Advanced previews | done |
| 10 | Settings + provider configuration | done |
| 11 | Interaction tests (44 passing) | done |
| 12 | Verification, screenshots, README, CI, handover | done |
| 13 | iOS-inspired premium UI polish (4 commits, branch `feat/premium-ios-ui`) | done |
| 14 | Reduced-transparency preference (toggle + OS tracking) | done |
| 15 | BYOK: credential types + private storage | done |
| 16 | BYOK: connection testing + model discovery | done |
| 17 | BYOK: live streaming adapter (OpenAI-compat + Anthropic) | done |
| 18 | BYOK: store wiring + live routing | done |
| 19 | BYOK: Settings connect UI | done |
| 20 | BYOK: top-bar Live indicator | done |
| 21 | BYOK: 18-test suite (65 total) | done |
| 22 | BYOK: E2E verification vs real local endpoint + docs | done |

## Decisions log

- 2026-10-17 — No established stack existed on `main` (single README, prior history emptied in `b9047067e`); fresh Vite scaffold chosen per prompt guidance.
- 2026-10-17 — Message tree with `activeLeafId` chosen for branching (see `conversation-model.md`); edit/regenerate add siblings, never delete.
- 2026-10-17 — Theme stored under its own key (`universe:theme`) applied pre-hydration by an inline boot script; other preferences persist in the versioned app schema.
- 2026-10-17 — Tool availability derives from a model capability registry, not API-key presence.
- 2026-10-17 — Mock adapter is deterministic (hash-seeded); `/fail` prefix simulates errors for testing retry states.
- 2026-10-17 — Tests surfaced and fixed a real bug: sending from the root route now renders the transcript (display falls back to the store's active conversation without breaking browser Back).
- 2026-10-17 — BYOK keys live under their own storage key (`universe:credentials:v1`), never inside `universe:data`, so exports and shares cannot leak credentials. Keys are only sent to the endpoint the user configured, directly from the browser.
- 2026-10-17 — A key that fails authentication is never persisted; failed tests against an existing credential downgrade it to `error` with the diagnostic.
- 2026-10-17 — Adapter routing resolves per turn: connected credential + selected model → live adapter; otherwise the deterministic demo adapter. Provider “kind” only decides wire protocol (OpenAI-compatible vs Anthropic native).
- 2026-10-17 — Successful connects adopt the endpoint's discovered model list and mark the profile live; first model auto-activates only when the user has no other active model.

## Checks (final, 2026-10-17)

- `npm run lint` — pass (0 problems)
- `npm run typecheck` — pass
- `npm run build` — pass (chunked; ≈211 KB gzip total)
- `npm test` — 65/65 passing (9 files)
- Headless browser (BYOK pass): connect → discover models → live SSE chat → reload persistence → wrong-key 401 honesty; zero console/page errors; no overflow at 375/1440px; network log shows only same-origin assets + the user-configured endpoint
- Vision QA: providers 9/10, live chat 9.5/10, dark mode 9.5/10 — all PASS

Details and honest limits (screen-reader pass, axe audit, real-IME, real devices, cross-browser matrix): `verification.md`.

## Blockers

- None. (Push access verified; all 13 pushes succeeded.)

## Next concrete task (for the continuing agent)

Week 2 of `roadmap.md`: accessibility pass with real assistive technology, performance pass on long conversations, research/canvas preview upgrades, and the cross-browser matrix. Start by reading `reference-audit.md` (evidence rules), `conversation-model.md` (invariants that must not regress), and this file.

---

# Milestone 03 — Work, Agents, Library, reliability

## Current state (Milestone 3)

- **Milestone:** Prompt 03 — Chat + Work + Agents workspace with premium
  iOS-inspired design. **COMPLETE.**
- **Branch:** `feat/universe-work-agents-ui` (14 commits, each committed
  and pushed individually per user instruction).
- **Audit:** `milestone-03-audit.md` — three reproduced defects (D1 menu
  viewport shift, D2 composer draft loss, D3 drawer semantics), one ARIA
  risk (R1), three product gaps (G1–G4), status-accuracy findings (S1/S2).
  All reproduced defects fixed with regression tests and browser evidence.

## Stage tracker (Milestone 3)

| # | Stage | Status |
| --- | --- | --- |
| 1 | Audit, evidence, design decisions | done — `milestone-03-audit.md` |
| 2 | Reliability fixes (D1/D2/D3/R1) + workspace foundation + routes | done |
| 3 | Work: templates, filters, state machine, review, download | done |
| 4 | Agents: directory, builder, personal assistant, chat wiring | done |
| 5 | Library: artifacts, projects, save-from-Work, polish | done |
| 6 | Regressions, responsive/a11y verification, docs | done |

## Key architecture decisions

- Workspace state lives in three new zustand stores (agents/work/library),
  each persisted under its own versioned key (`universe:agents:v1`,
  `universe:work:v1`, `universe:library:v1`). Schema-v1 chat data
  (`universe:data`) is never rewritten — zero migration risk to history.
- Work execution is a deterministic local runner with per-run ids; timer
  and abort handles are module-scoped and never persisted. Reload demotes
  running tasks to paused+interrupted.
- Agent conversations reuse the chat store with an `agentId` scope;
  instructions flow as `system` through both the mock and live adapters
  (OpenAI system message / Anthropic system field).
- `openAgentConversation(agentId)` guarantees one ongoing thread per agent.

## Next concrete tasks (for a future milestone)

- Real agent execution backend (schedules stay drafts until one exists).
- Artifact versioning and richer previews (PDF export needs a real renderer).
- Screen-reader pass with NVDA/VoiceOver on real devices; axe audit.
- Optional: project detail views linking tasks + artifacts.

---

# Milestone 04 — Dynamic workspace & premium features

Branch `feat/dynamic-workspace-premium` from `bb7be83ef` (main).

Delivered stages (each committed and pushed individually):

1. `docs/milestone-04-plan.md` — audited gaps (G1–G10), chosen composition,
   feature scope, acceptance checks.
2. Layout foundation — geometry tokens (256px sidebar, 768px reading column,
   360–560px inspector), `workspaceUiStore` (focus mode, remembered split),
   `SplitWorkspace` (pointer + keyboard resizing, full-height sheet below
   1280px).
3. Dynamic shell — simplified sidebar (project selector, context-aware New,
   one Tools menu), mobile bottom destination bar, honest activity
   indicator, focus mode with Escape.
4. Balanced empty chat — composer directly below the greeting, real recent
   work below, drafts/focus survive the transition (composer key-stable).
5. Workspace command palette (Feature A) — scopes, quick actions,
   platform-aware shortcuts; replaces the chats-only dialog.
6. Versioned artifacts + persistent Canvas (Feature B) — data layer first
   (10-test suite incl. migration from a real pre-v2 fixture), then the
   panel: autosaved drafts, named snapshots, diff, restore-as-new-version,
   save-from-message with source ids, canvas tool creates documents.
7. Real project context (Feature C) — context inspector with exact preview
   of what a live send includes, per-chat/task selection, project detail
   view, cross-store cleanup, `universe:context:v1`.
8. Real CSV analysis (Feature D) — papaparse-backed parsing with honest
   warnings, hand-checked summaries, grouping + labeled chart with data
   table, formula-sanitized exports, local-computation provenance
   (17-test suite).
9. Side-by-side model comparison (Feature E) — explicit Run, per-slot
   controllers (isolated stop/failure), demo fixtures, live BYOK with
   charge warning, credential-free history, continue-in-chat and
   save-to-Canvas (7-test suite).
10. `docs/capability-backlog.md` + feature-status/progress updates.

Quality gates at every step: eslint 0, tsc clean, full vitest suite green
(182 tests at the final feature commit), production build clean.

## Next concrete tasks

- Browser QA pass at 390/768/1440 both themes; screenshots; verification
  record update.
- Screen-reader pass with NVDA/VoiceOver on real devices; axe audit.
- Real-device Safari checks (backdrop-filter, dvh, safe areas).
- Backend integrations per `capability-backlog.md` — none were started, by
  design.

## Milestone 05 — Apple-inspired visual reset (18 October 2026)

Delivered on `feat/apple-inspired-visual-reset` (see
`milestone-05-design.md` for decisions and evidence):

1. Porcelain/graphite token system — new palette, 14px shell inset, 24px
   major surfaces, 28px composer, behavior-timed motion tokens, glass
   materials with edge highlight + grounded shadow, static welcome wash.
2. Floating shell — glass sidebar inset from the viewport, rounded mobile
   drawer, floating destination pill; menus moved to viewport-fixed
   positioning so no rounded ancestor can clip them.
3. Sidebar as a simple navigation list; New chat and Temporary chat are
   separate sibling controls (regression-tested).
4. Centered welcome composition — 44–52px headline, composer as the
   primary object, compact starter chips, accurate supported-provider
   wording.
5. Composer refinement (28px radius, 20px interior, 40px send/stop) and
   conversation polish.
6. One shared floating PageToolbar per destination with grouped icon
   actions; readable typography sweep (sentence-case labels, 15px titles).
7. Live AI drafting in Work — bounded BYOK draft mode: connected-model
   selection, charge warning, explicit Generate, run-scoped events,
   partial-content preservation on stop/failure, per-task controller
   isolation, provider-generated provenance, credential-free persistence,
   migrations for pre-AI-draft data (12-test suite).

Quality gates at every step: eslint 0, tsc clean, full vitest suite green
(196 tests at the final feature commit), production build clean, no
horizontal overflow at 390/768/1440px or 200% zoom, zero console errors,
zero non-local network requests, keyboard pass with visible focus.


## Milestone 06 — Plugins, conversational Work, persistent AI employees (19 October 2026)

Delivered on `feat/conversational-work-employees-plugins` (7 commits, each
pushed individually; see `milestone-06-plan.md` for the audit and
decisions):

1. Plan document — reuse/migration decisions, no AGENTS.md exists.
2. Conversation thread model + projections (14 tests).
3. Shared ThreadView / ThreadComposer / entry cards (7 tests).
4. Work message-first: goal composer, task threads, follow-ups + AI
   revision with explicit budgets, archived prior outputs, responsive
   Details inspector.
5. Employees: direct conversations, honest availability, inspector
   (Profile/Memory/Work/Plugins/Routines), explicit commands.
6. Plugins: typed registry, store, dispatcher (access intersection, run
   ids, AbortSignal, late-result rejection), catalogue/detail UI, composer
   picker, per-employee allow list, three real local adapters (Documents,
   Data analysis, Library context) — one interlocking commit.
7. QA polish from VLM review + milestone regressions (multi-turn revision
   context, slice migrations, drafts across surfaces).

Quality: 241/241 tests, lint 0, typecheck clean, build clean; browser QA
of every journey with zero console errors; no overflow 390/768/1440/200%;
network-isolated; VLM 8–9/10 with fixes applied.

Next concrete tasks:

- Screen-reader (NVDA/VoiceOver) and axe audit across the new surfaces.
- Real-device Safari pass (backdrop-filter, dvh, safe areas).
- Provider-driven tool calling as an explicit opt-in adapter behind the
  dispatcher boundary (see capability-backlog.md).
- An external/MCP plugin prototype behind `registerAdapter` with real
  consent screens — no connection claims until a handshake exists.

## Session 07 — Uni rename, Grok/DeepSeek presets, settings polish

Scope (three commits, delivered one at a time on
`feat/uni-rename-providers-polish`):

1. **Universe → Uni rename** across the whole product surface: wordmark,
   composer label/placeholder, seeded conversations, demo provider label,
   assistant system prompt, export headers, CSV footers, settings and
   preview copy, `<title>`/meta, package name, `UniverseMark` → `UniMark`.
   Storage keys (`universe:*`) intentionally untouched so existing local
   data keeps loading; routes unchanged.
2. **Provider presets**: xAI · Grok (`api.x.ai/v1`) and DeepSeek added;
   labels now lead with model families (OpenAI · GPT, Anthropic · Claude,
   Google AI Studio · Gemini) so the list reads like a model picker.
   Kind label, helper copy, and the empty-state provider hint updated.
   Regression test locks the new presets in.
3. **Settings polish**: SettingsGroup headers render as iOS small-caps
   labels with consistent rhythm (fixes the floating "Display" header
   from visual QA); provider cards stack kind + endpoint on separate
   lines so long URLs break cleanly.

Quality at each commit: typecheck clean, eslint clean, vitest green
(242/242 after the new preset test), production build clean. Browser
re-verification on the production build: zero console/page errors, no
horizontal overflow, VLM confirms header rhythm and clean chip wrapping.

## Milestone 07 — dependable, coherent, premium

Branch `feat/m07-dependable-coherent-premium` (stacked on the rename branch):
eleven commits, each gated and pushed individually.

1. Audit doc — all 13 findings reproduced or source-confirmed.
2. Canonical save (F01/F02) — one operation shared by Outputs panel and
   plugin adapter; provenance preserved; no-op saves; recreate path;
   active-branch employee saves.
3. Dispatch feedback (F03) — every outcome reported; one-tap Allow
   recovery; rejection receipts.
4. Cancellation correctness (F05/F06) — thread/agent-scoped aborts; signal
   checks around async reads and before Library writes.
5. Employee memory (F04) — notes resolved into requests at send time,
   bounded and scoped; retention wording; redacted event labels.
6. Real modals (F07) — InspectorPanel (mobile modal sheet / desktop
   complementary dock); Library picker on shared Dialog.
7. Honest export + workspace backup (F08) — truthful scope labels;
   versioned backup/restore with validation, preview, snapshot.
8. Plugins in ordinary Chat (F09) — chat thread kind; receipt strip;
   session-only chat grants; temporary receipts never persist.
9. SSE hardening + attachment honesty (F12/F13) — event-buffered parser,
   CRLF/multiline, trailing flush, terminal error frames.
10. Unified activity + output actions (F10/Phase 4) — one chronological
    Activity card; Save/Update + Copy beside the output.
11. Docs (this commit).

Quality: 271/271 tests (40 files), lint 0, typecheck clean, build clean;
browser journeys green with zero console errors.

Next concrete tasks: screen-reader + axe audit, real-device Safari pass,
provider-driven tool calling behind the dispatcher boundary, MCP plugin
prototype with real consent screens.

## Session 08 — QA polish + the Grok Bot teammate

User report: "Still UI has some bugs — fix them all — and add the Grok
Bot (https://x.ai/bot), it must be important."

Browser audit of every destination at 390/768/1440, light + dark, zero
console errors. Confirmed defects fixed (VLM flags that measured as
false positives were left alone):

1. Dialogs without an explicit initial focus put a visible ring on the
   header close button at open time (focus now lands on the panel
   surface; Tab still reaches content, Escape/close behavior unchanged).
2. Provider kind label wrapped with an orphaned "…" alone on its second
   line — copy is now wrap-safe ("and more").
3. Top-bar model chip cut the provider label at 8rem
   ("Uni Demo — Balan…") — max widths raised to 12rem.
4. Agents and Plugins pages showed the same title twice (toolbar h1 +
   content h2) — content headings now read "Your AI teammates" and
   "Tools that stay local".

Grok Bot (modeled on xAI's positioning: "AI teammates you can give real
work to"):

- Seeded builtin profile (direct, end-to-end, no-ceremony instructions)
  with three starters and the research tool.
- One-time migration adds it to installs that saved an agents slice
  before it existed; a flag keeps the addition one-time so a user who
  archives or removes it keeps that choice.
- Featured hero card on the Agents page: monochrome emblem, "New" +
  "Built-in" badges, balanced tagline, starter chips that open the
  bot's thread with the composer prefilled, Chat/Assign actions, and an
  honest provider hint that deep-links the Providers settings.
- xAI · Grok now leads the provider preset list.

Quality: 273/273 tests (40 files), lint 0, typecheck clean, build clean.
Browser journeys green (migration + fresh install, starter prefill,
settings deep-link, mobile 390, light + dark) with zero console errors.
