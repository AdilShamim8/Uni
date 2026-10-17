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

## Decisions log

- 2026-10-17 — No established stack existed on `main` (single README, prior history emptied in `b9047067e`); fresh Vite scaffold chosen per prompt guidance.
- 2026-10-17 — Message tree with `activeLeafId` chosen for branching (see `conversation-model.md`); edit/regenerate add siblings, never delete.
- 2026-10-17 — Theme stored under its own key (`universe:theme`) applied pre-hydration by an inline boot script; other preferences persist in the versioned app schema.
- 2026-10-17 — Tool availability derives from a model capability registry, not API-key presence.
- 2026-10-17 — Mock adapter is deterministic (hash-seeded); `/fail` prefix simulates errors for testing retry states.
- 2026-10-17 — Tests surfaced and fixed a real bug: sending from the root route now renders the transcript (display falls back to the store's active conversation without breaking browser Back).

## Checks (final, 2026-10-17)

- `npm run lint` — pass (0 problems)
- `npm run typecheck` — pass
- `npm run build` — pass (chunked; ≈184 KB gzip total)
- `npm test` — 44/44 passing (8 files)
- Headless browser: no horizontal overflow at 375/768/1440px, no console errors, network log shows only same-origin asset requests (no outbound calls)
- 12 screenshots captured and reviewed (vision-model QA: CLEAN) — see `verification.md`

Details and honest limits (screen-reader pass, axe audit, real-IME, real devices, cross-browser matrix): `verification.md`.

## Blockers

- None. (Push access verified; all 13 pushes succeeded.)

## Next concrete task (for the continuing agent)

Week 2 of `roadmap.md`: accessibility pass with real assistive technology, performance pass on long conversations, research/canvas preview upgrades, and the cross-browser matrix. Start by reading `reference-audit.md` (evidence rules), `conversation-model.md` (invariants that must not regress), and this file.
