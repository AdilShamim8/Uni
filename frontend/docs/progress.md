# Progress Log — Universe Frontend

Living document. Updated per milestone stage so any agent can continue from here.

## Current state

- **Milestone:** Prompt 01 — chat interface and frontend foundation.
- **Branch:** `feat/universe-chat-ui` (from `main`, which contains only a README).
- **Stack (decided):** Vite 5 + React 18 + TypeScript (strict) + Tailwind CSS 3 + zustand + react-router-dom; lucide-react icons; react-markdown + remark-gfm + rehype-highlight for message rendering; Vitest + Testing Library for interaction tests. No backend, no real integrations.
- **Delivery:** staged commits, each pushed individually per user instruction; draft PR at the end.

## Stage tracker

| # | Stage | Status |
| --- | --- | --- |
| 1 | Audit + planning docs | done (2026-10-17) |
| 2 | Toolchain scaffold | pending |
| 3 | Design tokens + themes | pending |
| 4 | Domain, mock adapter, store, persistence | pending |
| 5 | UI primitives | pending |
| 6 | App shell, sidebar, search, top bar | pending |
| 7 | Composer, attachments, empty state | pending |
| 8 | Messages, streaming, markdown, variants | pending |
| 9 | Export, temporary chats, undo, search polish | pending |
| 10 | Settings + provider configuration | pending |
| 11 | Advanced previews | pending |
| 12 | Tests | pending |
| 13 | Verification, README, CI, handover | pending |

## Decisions log

- 2026-10-17 — No established stack existed on `main` (single README, prior history emptied in `b9047067e`); fresh Vite scaffold chosen per prompt guidance.
- 2026-10-17 — Message tree with `activeLeafId` chosen for branching (see `conversation-model.md`); edit/regenerate add siblings, never delete.
- 2026-10-17 — Theme stored under its own key (`universe:theme`) applied pre-hydration by an inline boot script; other preferences persist in the versioned app schema.
- 2026-10-17 — Tool availability derives from a model capability registry, not API-key presence.
- 2026-10-17 — Mock adapter is deterministic (hash-seeded); `/fail` prefix simulates errors for testing retry states.

## Checks

- (stages 2+ will append lint/typecheck/build/test results here and in `verification.md`)

## Blockers

- None currently. Push access verified by first stage push.

## Next concrete task

Stage 2 — scaffold the Vite + React + TS + Tailwind toolchain under `/frontend` (configs, entry, smoke test), run `npm install` and a production build, then commit and push.
