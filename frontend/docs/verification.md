# Verification Record — Milestone 3

Date: 2026-10-17 · Branch: `feat/universe-work-agents-ui`
All commands run from `/frontend` on the final commit of the milestone.

## Automated gates (fresh run)

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | 0 problems |
| Types | `npm run typecheck` | pass |
| Tests | `npm test` | **137 passed / 137** (22 files) |
| Build | `npm run build` | pass (~3.6 s, code-split) |

## New regression coverage (milestone 3)

- **D1** menu collision: flip-on-overflow, preventScroll focus, sidebar
  account menu opens upward (`menu.test.tsx`).
- **R1** ARIA: `menuitemcheckbox` / `menuitemradio` roles with checked
  state; plain items stay `menuitem` (`menu.test.tsx`).
- **D2** composer: text typed during streaming survives turn completion;
  drafts scoped per conversation and restored on switch
  (`composerDrafts.test.tsx`).
- **D3** drawer: dialog semantics, Escape close, inert background, focus
  return to trigger (`mobileDrawer.test.tsx`).
- Task machine: legal transitions, no completion from cancelled/failed
  (`taskMachine.test.ts`).
- Work store: run-to-review lifecycle, cancel + late-event rejection,
  reload demotion to paused+interrupted, needs_input persistence with
  answers reaching the report, cross-task isolation, pause/resume
  (`workStore.test.ts`).
- Workspace storage: per-slice round-trip, wrong-version quarantine,
  corrupt-JSON quarantine with backup (`workspaceStorage.test.ts`).
- Agents store: seeds, CRUD, builtin delete protection, archive-on-
  reference, duplicates, notes, persistence (`agentsStore.test.ts`).
- Work flow E2E: template → brief → agent → run → input → activity →
  edit → **download matches the edited report** → complete; filters;
  direct-URL load; unknown-id recovery; agent-linked tasks
  (`workFlow.test.tsx`).
- Agents flow: directory search, builder validation, create/edit, agent
  chat scoping with reused thread and honest demo note, memory CRUD,
  schedule drafts with unavailable-execution labels, assigned work
  (`agentsFlow.test.tsx`).
- Library flow: save-from-Work (no duplicates), rename/edit/download/
  delete, projects with counts (`libraryFlow.test.tsx`).
- Storage honesty: failed writes warn once through the toast system
  (`storageFailure.test.tsx`).

## Browser verification (headless Chromium, production build)

- **Complete demonstration, end to end:** Work → Research brief template →
  brief with Research Analyst → Run demo → answer "Quick comparison" →
  activity timeline shows simulated tool steps → report renders with
  "Example report — simulated output" → edited to "My final router
  notes" → download (spied: contains the edit) → Save to Library →
  Mark complete → Library lists the artifact with provenance and source
  task; the viewer shows the edited content.
- **Reload interruption:** running email-draft task reloaded mid-run →
  status "Paused", "interrupted by a reload" note, Resume button →
  resumed → answered → Ready for review.
- **Agent chat:** Chat with agent → conversation titled
  "Chat with Research Analyst", agent chip in the top bar, demo reply
  notes "Working from your agent instructions".
- **D1/D2/D3 re-verified on the final build:** root scrollTop stays 0 with
  the profile menu open; a draft typed mid-stream survives; the drawer
  closes on Escape and restores focus.
- **Responsive:** no horizontal overflow at 375, 390, 768, 1440 px on
  Chat, Work, Agents, and Library (document scrollWidth ≤ innerWidth).
- **Console/page errors:** zero across all flows (only React Router v7
  future-flag advisories, pre-existing).
- **Keyboard:** Tab moves through sidebar destinations and tools; menus,
  dialogs, and the drawer are operable from the keyboard (covered by
  component tests).
- **Themes:** light and dark verified visually (screenshots 10–12).

## Visual review (VLM)

| Screenshot | Score |
| --- | --- |
| Task workspace (ready for review) | 8/10 |
| Mobile Work home | 7/10 → filter chips made horizontally scrollable |
| Dark-mode chat | 8/10 |
| Library artifact viewer | 8/10 |

Remaining VLM notes are minor polish (spacing rhythm, some low-contrast
secondary text in dark mode) — recorded, not blocking.

## Honest limits (not covered)

- No screen-reader (NVDA/VoiceOver) or real-device pass — deferred.
- No axe automated audit run.
- Real IME input and Safari-specific behavior untested.
- Live-provider paths verified in earlier milestones (PR #8) via a local
  OpenAI-compatible server; agent system prompts over live SSE are
  typechecked and code-reviewed but not re-run against a real endpoint
  in this record (no paid traffic policy).
