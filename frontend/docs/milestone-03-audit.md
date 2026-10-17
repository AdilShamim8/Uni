# Milestone 03 audit — Work, Agents, Library, and reliability

Date: 2026-10-17 · Branch: `feat/universe-work-agents-ui` (from `main` @ `d65ca791c`)
Method: source inspection plus reproduction on the production build (`npm run build` →
`vite preview`, headless Chromium 1280×720 and 390×844). Evidence-first: every
"reproduced defect" below was re-created in a live browser on this branch's starting
commit before any fix was written. Items that could not be reproduced are filed as
code-review risks or product gaps, not bugs.

## 1. Reproduced defects (evidence attached)

### D1 — Profile menu shifts the application viewport

- **Repro:** 1280×720 → open the sidebar's bottom account menu.
- **Evidence:** after opening, the root `div.flex.h-dvh.overflow-hidden` has
  `scrollTop = 84`; the sidebar's first child (identity header) sits at
  `getBoundingClientRect().top = -84` — moved out of view. `window.scrollY`
  stays 0, so the shift is invisible to any scroll-position check that only
  reads the document.
- **Cause:** the account `Menu` omits `direction="up"`, so its panel opens
  downward from a trigger that is already at the viewport bottom (panel bottom
  = 720 = viewport height). `Menu`'s open effect calls `first?.focus()`; the
  browser's scroll-into-view for a focused off-screen element programmatically
  scrolls an `overflow:hidden` ancestor, which the user cannot scroll back.
- **Fix plan:** open bottom-anchored menus upward; add generic collision
  handling to `Menu` (flip on viewport overflow, max-height + internal scroll,
  `focus({ preventScroll: true })`); regression test asserts the root
  container's `scrollTop` stays 0 and the sidebar header stays in view.

### D2 — Composer discards text typed while a reply streams

- **Repro:** send "First message about planets"; ~300 ms later (stop button
  visible — `streamingAtTypeTime: true`) type "DRAFT TYPED DURING STREAM";
  wait for the stream to finish.
- **Evidence:** after the assistant turn completes the textarea is empty
  (`val: ""`) — the draft typed during streaming was deleted.
- **Cause:** `Composer.handleSend` awaits `sendMessage(...)` (the whole
  stream) and clears `text`/`pending` in `finally`. What it clears is the
  *current* state at completion time, not a snapshot of what was submitted —
  anything typed after submit is wiped when the turn ends. Attachments added
  during streaming are wiped the same way.
- **Fix plan:** snapshot the submitted payload (text, attachments, tools);
  clear the composer immediately at submit time; revoke object URLs only for
  the submitted attachments; keep drafts per conversation (switching
  conversations must not mix or lose drafts). Regression test: type during an
  artificially slowed stream; the draft must survive completion.

### D3 — Mobile navigation drawer lacks modal semantics

- **Repro:** 390×844 → open the drawer via "Open navigation".
- **Evidence:** the open drawer has no `role="dialog"`, no `aria-modal`,
  pressing Escape leaves it open (`drawerAfterEscape: true`). There is no
  focus trap, no focus return, and the page behind stays interactive.
- **Cause:** `AppShell` renders the drawer as plain positioned markup; only
  the scrim has an `onClick`.
- **Fix plan:** treat the drawer as a modal: `role="dialog"` +
  `aria-modal="true"`, labeled by the sidebar's identity block, Escape closes,
  focus is trapped inside while open and returns to the menu button on close,
  background marked `inert`, body scroll locked. Test: Escape closes, focus
  stays inside, background is inert.

## 2. Code-review risks (not reproduced; fixed defensively)

- **R1 — ARIA:** `MenuItem` renders `aria-checked` on `role="menuitem"`,
  which is not a valid combination. Selectable items must use
  `menuitemcheckbox`/`menuitemradio`.
- **R2 — Abort/stream ownership:** the store keeps one module-scoped
  `activeAbort` for the whole app. It is safe for the single-conversation chat
  flow it serves today, but any second concurrent stream (for example a Work
  demo) must use its own handles — do not reuse this global for task runs.
- **R3 — Route/refresh:** pages that will hold unsaved forms (Work brief,
  Agent builder) must tolerate direct loads, refresh, and unknown ids by
  re-deriving state from stores, not from in-flight component state.

## 3. Product gaps (feature work, not defects)

- **G1 — Work:** the sidebar's "Work" entry opens a "Planned — preview"
  dialog. There is no task list, brief, execution state machine, review flow,
  or output download.
- **G2 — Agents:** no destination exists. Assistant *presets* (five
  instruction presets in `previewFixtures`) are a separate, conflicting
  profile system with no CRUD, no memory, no assigned work.
- **G3 — Library:** no shared artifact collection. Research/Email/Data
  outputs are not reachable from any list, cannot be renamed or re-downloaded.
- **G4 — Personal assistant:** no persistent assistant view with
  conversation, assigned work, memory notes, or schedules.

## 4. Status-accuracy findings

- **S1 — Sidebar "Demo" badge is hard-coded** while the TopBar correctly
  derives Live/Demo from credentials. With a connected provider the app shows
  "Live" at the top and "Demo" in the sidebar simultaneously. Fix: derive the
  sidebar badge from the same status source; make labels mode-specific (chat
  live ≠ Work execution demo).
- **S2 — Documentation drift:** root README still describes the app as
  offline-only with no provider support; feature-status docs predate the
  merged BYOK work. To be updated in Stage 6.

## 5. Design decisions (locked before implementation)

1. **Destinations:** Chat, Work, Agents as primary navigation; Library as a
   shared secondary destination; Tools stay expandable; history becomes
   route-specific (tasks on Work, conversations elsewhere).
2. **One Work, one Agents:** no second execution engine or competing task
   history. Agents are reusable identities; Work holds task instances that
   reference an agent. The personal assistant is the seeded, editable
   "Universe Assistant" agent profile — naming isolated to constants.
3. **State isolation:** new Zustand slices (`agents`, `work`, `library`) in
   their own modules, persisted under a separately versioned
   `universe:workspace:v1` namespace — schema-v1 chat data is never
   rewritten, so no migration risk to existing conversations.
4. **Honest execution:** Work runs are local simulations with unique run ids,
   cancellable, pausable, and re-hydrated as *interrupted* after a reload —
   never as "kept running". Schedules are labeled
   "Saved locally — execution unavailable".
5. **BYOK preserved:** live chat, credentials, and provider management stay
   exactly as merged in PR #8; agent conversations add only an optional
   system prompt to the existing adapter contracts.
6. **iOS-premium refinement over redecoration:** calmer hierarchy (tinted
   navigation layer, opaque work surfaces), collision-safe menus, 44 px
   targets, no new animation framework; existing token names reused.

## 6. Priorities

Data-loss and navigation fixes first (D2, D1, D3, R1), then destinations
(Stage 2), then Work (Stage 3), Agents (Stage 4), Library + polish (Stage 5),
then regressions, responsive/a11y passes, and documentation (Stage 6).
