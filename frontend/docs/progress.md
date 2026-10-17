# Progress Log — Universe Frontend

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
