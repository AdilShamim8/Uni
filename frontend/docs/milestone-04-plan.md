# Milestone 04 — Dynamic workspace & premium features: plan

Status: in progress · Branch: `feat/dynamic-workspace-premium` · Base: `bb7be83ef` (main, post-Milestone-03)

## 1. Evidence from the current implementation

Audited on the actual default-branch tree (all PRs #5–#11 merged). The regression
destinations from Milestone 03 (profile-menu collision, composer draft ownership,
mobile drawer modal semantics) are recorded as fixed and are treated as
regressions to preserve, not defects to rebuild.

What exists and is kept:

- Four coherent destinations: Chat (`/`, `/c/:id`), Work (`/work`, `/work/:taskId`),
  Agents (`/agents`, `/agents/:agentId`), Library (`/library`), routed in `App.tsx`.
- Live BYOK chat: `credentials.ts` (private `universe:credentials:v1` storage),
  `providerConnection.ts`, `liveChatAdapter.ts` (SSE, OpenAI-compat + Anthropic),
  per-turn adapter resolution in `store.ts` (`resolveAdapter`).
- Versioned, independently quarantined workspace slices: `universe:agents:v1`,
  `universe:work:v1`, `universe:library:v1` (`workspaceStorage.ts`).
- 137 tests, lint clean, typecheck clean, build clean (re-run on this branch
  before any change).

Confirmed gaps (each verified in source, not assumed):

| # | Gap | Evidence |
|---|-----|----------|
| G1 | Chat empty state pushes the composer far below the greeting; a large empty band sits between starters and input | `ChatPage.tsx` renders `EmptyState` (own scroll container, `sm:pt-[max(8vh,3rem)]`) with `Composer` pinned after it |
| G2 | Sidebar gives every section its own inset card + separators + status dots; `New chat` is the dominant action on every destination | `Sidebar.tsx` — GroupedCard per group, `Button variant="primary"` "New chat" always on top |
| G3 | No workspace-wide search: Ctrl/Cmd+K opens conversation search only | `App.tsx` shortcut → `searchOpen`; `SearchDialog.tsx` searches `conversations` only |
| G4 | Canvas is session-only state in a narrow right overlay | `CanvasPreview.tsx` — `useState` for document/code, "Session-only edits" badge |
| G5 | Data analysis shows a bundled fixture with precomputed numbers | `DataAnalysisPreview.tsx` — `SAMPLE_CSV`/`SAMPLE_SUMMARY`, copy says "not computed from your files" |
| G6 | `Artifact` has mutable `markdown` but no version history | `workspaceTypes.ts` `Artifact`; `libraryStore.updateArtifact` overwrites in place |
| G7 | No project detail view; `deleteProject` leaves raw orphan `projectId`s on tasks; chat/tasks cannot carry explicit context | `libraryStore.ts` comment: "the work page shows the raw id if the project disappears" |
| G8 | No model comparison anywhere | feature matrix + source inventory; only single active model per turn |
| G9 | No focus mode, no resizable inspector; `WorkPage.tsx` ≈ 1,019 lines, `AgentsPage.tsx` ≈ 696 | source measurement |
| G10 | No honest capability backlog distinguishing local / live / simulated / missing | docs have a feature-status matrix but no constraint→requirement table |

## 2. Chosen composition (iOS/iPadOS-inspired, desktop-adapted)

Shared shell:

- Sidebar (~256px): identity row with a compact **workspace/project selector**
  (menu; project chip only when selected), one **Search** trigger (⌘K), a single
  grouped nav card (Chat, Work, Agents, Library), **one context-aware New
  action** (New chat / New task / New agent / New document by destination),
  context-sensitive recent items below, occasional tools in **one Tools menu**
  (not cards), account row at the bottom.
- Header (each destination): destination title, consistent model/agent/context
  controls on Chat, **activity indicator** that appears only when Work tasks are
  actually running/paused (real count + link to `/work`), focus-mode toggle.
- **Focus mode** collapses the sidebar and secondary header controls; state and
  drafts untouched; exits via the same toggle or Escape.
- Phones: compact **bottom destination bar** (4 destinations) + drawer/sheet for
  history and context. Safe areas, `100dvh`, and virtual keyboard respected
  (already `h-dvh` in `AppShell`).

Chat home:

- Empty chat = one centered composition: greeting, optional starters, composer
  immediately below (G1), then — only when real local data exists — a few recent
  projects/tasks/artifacts. No seeded fake activity.
- After send: normal conversation, composer at bottom, focus preserved (existing
  `Composer` keeps drafts; verified as regression `composerDrafts.test.tsx`).

Desktop working area:

- `SplitWorkspace`: main column (reading area 720–800px centered) + optional
  right panel (Canvas document or context inspector, 360–560px) — never a
  full-app scrim for ordinary editing.
- Resizable: pointer drag + keyboard (role="separator"), min 360px, reset
  control, width remembered in `universe:layout:v1`. Below the comfortable
  breakpoint the panel becomes a full-height overlay with tabs.
- Independent scroll per panel; clear Close control; selected artifact/task
  stays understandable (title + provenance chip).

Visual spec:

- Understated neutral light canvas; genuine dark theme (true dark surfaces, not
  inverted light); single violet accent; crisp system typography; fewer repeated
  borders and tiny gray text; states distinguished by more than color.
- Geometry: sidebar 256px; reading column max 768px; inspector default 420px
  (min 360, max 560); controls 12px radius; groups 16px; overlays 22–24px.
- Translucency only for navigation/floating materials with existing opaque
  fallback (`data-transparency`); 140–220ms transform/opacity motion with
  reduced-motion support; no continuous blur animation, no replayed message
  entrances, no fake progress.

## 3. Feature scope (all five, in order)

A. **Workspace command palette** — Ctrl/Cmd+K opens global search with scopes
   (All, Chats, Tasks, Agents, Projects, Files), keyboard navigation, grouped
   results, empty states, and actions (New chat/task/document, Open settings,
   Switch theme). Chats-only flow preserved via a scoped entry point. Temporary
   chats excluded from indexes; credentials never indexed. Platform-aware
   shortcut labels.

B. **Persistent Canvas + artifact versions** — Canvas becomes a Library-backed
   workspace panel: New document, Open in Canvas (from message/task output),
   edit/preview/rename/copy/download, debounced working-draft autosave with
   truthful saving/saved/error states, bounded version history, named snapshots,
   diff, Restore-as-new-version. Saving a message copies the selected response
   variant with source conversation/message ids (never silent overwrite). Run
   reports stay run snapshots; published artifacts are editable versioned copies
   with a source link. Code tab = editing/reading only, safe rendering only.

C. **Real project context** — project detail view (within Library) linking its
   chats/tasks/agents/artifacts; per-chat/task context selection with add/remove;
   visible context inspector showing exactly what is selected and whether content
   is available; plain-text/Markdown context within explicit size limits; content
   leaves the browser only on an explicit live send (preview included); selection
   persisted in its own `universe:context:v1` slice with migration; deleted
   projects handled without orphan ids.

D. **CSV analysis of uploads** — real browser-local parsing (maintained parser),
   quoted delimiters/newlines, invalid-row warnings, file/row limits shown, input
   preview, column selection, ambiguous numeric/date handling, real
   row/column/missing/numeric summaries, user-selected grouping + labeled chart
   with data-table alternative, downloads of actual results (formula-sanitized
   CSV), derived artifact with local-computation provenance. Sample retained as
   an explicitly labeled example running the same code path.

E. **Side-by-side model comparison** — optional Compare action in Chat: choose up
   to two models, one prompt, inspect intended context, explicit Run. Fixture
   demo without a key (two clearly labeled responses); real requests only
   through the existing BYOK/live adapter path and only after the user triggers
   it, with an up-to-two-requests warning. Separate controllers, run ids, and
   result slots per side; partial failure/stop never cancels or erases the other
   side; never routed through the module-scoped active-chat controller. Copy,
   continue as conversation, save to Canvas; neutral presentation — no invented
   scores, costs, or latencies; no auto-run, no key use in tests.

## 4. Safety & migration rules for this milestone

- No wiping `universe:data`, `universe:agents:v1`, `universe:work:v1`,
  `universe:library:v1`; new fields are optional with defaults; artifacts gain
  `versions` via migration from their current `markdown`; migration tested from
  an actual pre-v2 fixture shape.
- Temporary-chat data stays out of persistent artifact/index/compare state
  unless the user deliberately saves it (and is told what saving means).
- Quota/private-mode failures stay honest (no "Saved" on failed writes).
- Drafts survive routing, resizing, panel toggles, streaming, model changes.
- Links and id references survive rename/archive/delete (no orphan raw ids).
- No screenshot-only facades; no new backend systems; no paid calls in checks.

## 5. Acceptance checks

- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all green;
  new suites cover palette navigation/scopes, artifact migration + version
  restore, editable download contents, real CSV computation + malformed input,
  context scoping, comparison cancellation/partial failure, credential-free
  exports. Earlier menu/draft/drawer regressions stay green.
- Browser QA: every destination (Chat empty + populated, Work, Agents, Library,
  Canvas, compare, data analysis, palette, settings, menus) at ~390/768/1440px,
  both themes, short viewports, keyboard-only navigation + panel resizing,
  reduced motion/transparency, 200% zoom. No unintended horizontal scroll,
  obscured composer, focus loss, or clipped overlays.
- Before/after screenshots for hierarchy, spacing, legibility, and whether each
  feature completes a real action; explicit old-vs-new behavior examples; honest
  reporting of real-device/Safari/screen-reader limits.

## 6. Delivery sequence

1. This plan (baseline captured above). 
2. Shell + balanced empty composer + responsive split-panel foundation + focus mode.
3. Command palette, persistent Canvas, artifact history (end to end).
4. Project context, CSV analysis, two-model comparison (in that order).
5. Work/Agents/Library refined with the same system; accurate task activity.
6. Checks, docs (capability backlog, verification, feature matrix), evidence,
   commits (one at a time), draft PR.
