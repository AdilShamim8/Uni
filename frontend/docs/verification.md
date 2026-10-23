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

---

# Milestone 04 verification — Dynamic workspace & premium features

Branch `feat/dynamic-workspace-premium` · base `bb7be83ef` (main). All checks
below were run on the final code, not on intermediate states.

## Automated gates

| Check | Result |
| --- | --- |
| `npm run lint` (eslint 9 flat) | 0 problems |
| `npm run typecheck` (tsconfig + node) | pass |
| `npm run test` (vitest, 27 files) | **182/182 passed** |
| `npm run build` (tsc + vite production) | pass, ~100 KB gzip app chunk |
| Regression suites preserved | menu/draft-ownership/drawer suites from M3 still green (composer draft map extracted to `composerDrafts.ts` with test resets) |

New suites this milestone: `artifactVersions` (10), `canvasFlow` (2),
`contextFlow` (5), `csvAnalysis` (17), `compareFlow` (7), palette rework in
`search` (8). Every claim below is test-backed, including migration from a
real pre-v2 artifact fixture and credential-free exports/history.

## Browser QA (production build, headless)

Exercised end to end on `vite preview`:

- Empty chat composition → send → streaming reply; composer sits directly
  below the greeting (measured 292px gap including the 4 starter tiles —
  one composition, no dead band).
- **Save to Canvas** from the reply → inspector panel opens with the
  document; keyboard resize via separator (aria-valuenow 420 → 452 with two
  ArrowLeft presses); textarea edit autosaved as a working draft to
  `universe:library:v1` with **1 version** (no version per keystroke);
  "Save version" commits version 2.
- Context tab renders per-conversation selection surface.
- **Ctrl+K palette**: dialog opens, six scopes listed, "weekend" query →
  1 chat result.
- **Compare**: two demo models + prompt → explicit Run → both columns
  stream labeled demo fixtures; results present with measured durations.
- **Data analysis**: Tools menu → "Try the labeled sample" → real
  computation (rows × cols), column table, grouping (sum of checkouts by
  month) → labeled bar chart + data table.
- **Focus mode**: sidebar and panel collapse, Escape restores.
- Destinations: /work, /agents, /library all render with the shared header
  (activity chip + focus toggle + mobile menu).
- **Network isolation**: request log contains ONLY same-origin assets —
  zero external calls in every flow above (BYOK live paths require a user
  key by construction).
- **Zero console errors and zero page errors** across the entire session.

Viewports and overflow (`document.scrollWidth > clientWidth`):

| Viewport | Horizontal overflow | Notes |
| --- | --- | --- |
| 390 × 844 | none | bottom bar (4 tabs), sidebar hidden, composer visible |
| 768 × 1024 | none | bottom bar shown below lg |
| 1440 × 900 | none | sidebar + optional split inspector |

Themes: light and dark both screenshotted; dark uses layered charcoal
surfaces (not inverted light), single violet accent.

Screenshots: `download/m4-verify/01–18` (empty state, reply, canvas panel,
context inspector, palette, compare setup/results, data analysis upload/
sample/grouping, dark chat/canvas, mobile 390, tablet 768, focus mode,
work/agents/library).

## Vision review (VLM, strict prompt)

| View | Verdict | Score |
| --- | --- | --- |
| Empty state 1440 light | PASS | 9/10 |
| Split workspace (Canvas) | PASS | 8.5/10 |
| Dark chat | PASS | (reviewed; deep-charcoal dark called out positively) |
| Command palette | PASS | 8/10 |
| Compare results | PASS | 8.5/10 |
| Mobile 390 | PASS | (minor notes below) |
| Data analysis + chart | PASS | (labeled chart + tables verified) |

Feedback applied from the review: mobile bottom bar now reserves the iOS
home-indicator safe area (`env(safe-area-inset-bottom)`), and palette
keyboard hints use higher-contrast styling. Not applied (by design):
single-line title truncation in headers and panels.

## Honest limits

- No screen-reader (NVDA/VoiceOver) or axe audit yet; keyboard-only paths
  are tested programmatically but not with a real AT.
- Real-device Safari (backdrop-filter, dvh, safe areas) untested —
  verified only in headless Chromium.
- Live comparison and live chat were exercised against a local
  OpenAI-compatible test server in earlier milestones; this milestone's
  automated checks are credential-free by rule and use the demo path.
- 200% zoom and reduced-motion/transparency were implemented via tokens
  and media queries but not re-measured in a browser this round.


# Milestone 06 verification (19 October 2026)

Gates on the final feature commit: `npm run lint` 0 problems;
`npm run typecheck` clean; `npm test` **241/241** (32 files); production
build clean (≈122 KB gzip for the app chunk).

Browser QA on the production build (headless Chromium, synthetic data,
zero credentials):

| Journey | Result |
| --- | --- |
| Work: goal → auto demo run → clarify card → answer → output + output card | PASS — zero console/page errors |
| Work: follow-up → revision rerun → prior output archived → new output | PASS |
| Employee: open → message → live demo reply (agent instructions honored) | PASS |
| Employee: /remember → thread receipt + Memory panel note; /assign → brief → one real task → card opens the same task | PASS |
| Plugins: catalogue → enable Documents → detail access preview → disable path | PASS |
| Plugin action: grant from thread picker → Create Canvas document → real artifact + receipt in thread | PASS |
| Data analysis: real CSV via dispatcher → computed summary artifact (local-computation provenance); no-file → honest error | PASS (jsdom suite; UI path verified for picker/chip) |
| Reload an old task → transcript recovered (goal, activity, prior outputs) without rerun or duplication | PASS |
| Network isolation | PASS — performance entries show same-origin requests only |
| Overflow at 390 / 768 / 1440 and 200% zoom (Work, Agents, Plugins) | PASS — no horizontal overflow |
| Dark theme across new destinations | PASS |

VLM strict review of 6 desktop views: 8–9/10; verdict FIX with two notes —
plugin-detail access-preview contrast and button alignment — both applied
in the final polish commit, plus catalogue spacing and starter-chip
contrast.

Honest limits: screen-reader/axe pass and real-device Safari remain
untested; the data-analysis adapter's file-picker path was exercised via
the jsdom suite and the dispatcher directly rather than a native file
dialog; live BYOK revision requests were verified with a controlled fake
adapter (no paid traffic).

## Session 07 — rename, presets, polish (feat/uni-rename-providers-polish)

Gates re-run from scratch at every commit: `tsc --noEmit` clean, `eslint`
0 problems, `npm test` **242/242** (33 files; +1 preset regression test),
production build clean.

| Check | Result |
| --- | --- |
| Document title / wordmark / composer label read "Uni" everywhere | PASS |
| No `Universe` branding left in src, tests, index.html, package.json | PASS (storage keys `universe:*` intentionally retained for data continuity) |
| Existing localStorage data (pre-rename) loads without loss | PASS — keys unchanged |
| xAI · Grok preset fills `https://api.x.ai/v1`, DeepSeek fills `https://api.deepseek.com/v1` | PASS |
| Preset chips wrap cleanly; group headers rhythmically consistent | PASS (VLM re-review) |
| Zero console/page errors on all five destinations | PASS |
| No horizontal overflow at 390 / 768 / 1440 | PASS |
| Live BYOK E2E (fake local provider) still streams after rename | PASS |

## Milestone 07 — dependable, coherent, premium (feat/m07-dependable-coherent-premium)

Gates after every commit: `tsc --noEmit` clean, `eslint` 0 problems, targeted
suites before push, full suite **271/271** (40 files; +19 tests across six
new suites), production build clean.

| Audit finding | Disposition | Evidence |
| --- | --- | --- |
| F01 duplicate artifacts on repeated plugin save | Fixed | Browser: saved a Work report twice through Documents → exactly one artifact, `taskId` linked; unit: triple save keeps one id |
| F02 wrong provenance | Fixed | Browser: saved artifact shows `demo-simulation`; provider-generated keeps model snapshot |
| F03 silent denial | Fixed | Browser: employee-thread Create shows toast + "Allow for this employee"; one-tap fix; retry succeeds; rejection receipts recorded |
| F04 memory not in requests | Fixed | Adapter-payload tests: A's note for A only; edit/remove propagate; UI states real bounds |
| F05 cross-thread cancellation | Fixed | Unit: revoke thread A, B succeeds; receipts revoked/success respectively |
| F06 CSV side effects after cancel | Fixed | Unit: revocation during delayed read writes zero artifacts |
| F07 fake aria-modal | Fixed | Unit + browser: mobile sheet traps focus/Escape/return; desktop docked panel is complementary, not modal |
| F08 export scope dishonest | Fixed | Export relabeled; versioned workspace backup/restore with validation, preview, snapshot; round-trip test |
| F09 plugins absent from Chat | Fixed | Browser: ordinary chat grant → create → receipt strip → reload intact; picker empty state links to Manage Plugins; temporary receipts never persist |
| F10 split activity cards | Fixed | Browser: one "Activity · 6 steps" card; unit: single merged chronological entry |
| F11 Universe naming | Fixed on branch base | Rename branch (PR #17) |
| F12 attachment capability unstated | Fixed | Composer states names-only + local CSV exception beside chips |
| F13 SSE defects | Fixed | 6-fixture suite: boundary splits, CRLF/multiline, trailing event, terminal errors both protocols |

Browser journeys (fresh origin, production build, zero console/page errors):
ordinary-chat plugin round-trip incl. reload; Work double-save single record
with in-place update action; employee memory + denial/recovery; keyboard
modal checks at 1440/390; dark-mode Library/Plugins; no horizontal overflow
at 390/1440.

Remaining limitations (honest): no screen-reader/axe pass, no real-device
Safari pass, plugin picker menu items are keyboard-confirmed (pointer-event
automation quirk in the QA tool, not an app defect — jsdom click tests cover
the wiring), backup restore requires a reload by design.

## Milestone 08 — long-conversation performance (feat/m08-long-conversation-performance)

### Automated gates (fresh run, final commit)

- `npm run lint` — pass (0 problems)
- `npm run typecheck` — pass
- `npm test` — 295/295 passing (43 files; +21 new: 3 domain variant-position
  cases, 3 transcript memoization suites, 7 windowing math cases, 8
  windowed-transcript integration cases)
- `npm run build` — pass (unchanged chunking)

### Benchmark (production build, headless Chromium 1200, 1440×900)

Harness: `scripts/perf_long_conversation.py` — seeds a 600-message
conversation through the app's own persistence schema in a fresh context
before app scripts run, deep-links to it, and measures buffered longtask
entries plus a rAF-based mount probe. Numbers are single runs, each
reproduced twice and consistent within a few percent.

| Phase | Before (main) | After F14 memo | After F15 windowing |
| --- | --- | --- | --- |
| Mount — transcript stable | 1691 ms | 1440 ms | **524 ms** |
| Mount — longest main-thread block | 1356 ms | 1173 ms | **321 ms** |
| Mount — transcript DOM nodes | 19,506 | 19,506 | **4,025** (tail window of 120) |
| Mount — JS heap | 66–74 MB | 59 MB | **11 MB** |
| Stream 6 s — long tasks | 69 / 5047 ms | **0 / 0 ms** | **0 / 0 ms** |
| Stream 6 s — median frame | 83.3 ms (~12 fps) | **16.7 ms (60 fps)** | **16.7 ms (60 fps)** |
| Scroll 40×700 px — long tasks | 30 / 2097 ms | **0 / 0 ms** | 1 / 85 ms (one block materializing) |

Calibration: the same harness on the 4-message demo conversation mounts
in ~137 ms, so the remaining ~524 ms is app boot plus the bounded tail
window, not transcript cost.

### Windowing lifecycle (browser probe, production build)

Upward traversal of the full 600-message history materializes every
block (count 120 → 600) with scrollTop compensated by exactly the
prepended height each time — the visible message stays anchored and no
blank spacer scrolls into view. Scrolling back down collapses leading
blocks that pass fully above the viewport; the rendered set returns to
the 320-item cap (count 600 → 320) and scrollHeight settles bounded.
The probe was a local debug script; the committed benchmark covers the
mount/stream/scroll phases it was derived from.

### Honest limits

- Off-screen history is not in the DOM (or the accessibility tree) while
  windowed — the standard virtualized-transcript tradeoff; everything
  stays reachable by scrolling, transcripts ≤ 80 items never window, and
  jsdom (no layout) fails open to full rendering so tests read the whole
  transcript.
- Frame pacing in headless Chromium is indicative; long-task totals are
  the robust metric. No real-device pass was run in this milestone.
- A transcript that grows past the threshold mid-session starts windowing
  only once the reader returns near the bottom, so content under the
  reader's eyes is never removed by activation.

## Session 10 — dropdown clipping fix (main, session 10)

### Automated gates (fresh run, final commit)

| Gate | Result |
| --- | --- |
| `tsc --noEmit` (app + node configs) | clean |
| `eslint .` | 0 problems |
| `vitest run` | **298/298** across 43 files (+3 menu regressions) |

### Panel geometry (Chromium, before → after)

Measured on the sidebar Tools menu, mobile drawer open at 390×844,
before any fix / after the portal + flip + width commits:

| Measurement | Before | After |
| --- | --- | --- |
| Panel parent | sidebar (backdrop-filter containing block) | **document.body** |
| Panel DOM rect | x 36..276 (clipped) | **x 22..278, fully painted** |
| Visible panel right edge | 251 px (cut at sidebar edge) | **278 px (panel right edge)** |
| Open direction | — | **up, `pop-in-up`, bottom 720 of 844** |
| Hint texts | "Sample galler", "no microphon(e)", "Enable local tool(s)" — cut mid-letter, no ellipsis | **all five complete** |
| Label truncation | "Data analysis" → ellipsis (95 px text in 84 px) | **none — `scrollWidth ≤ clientWidth` on every row** |

Evidence screenshots: `screenshots/mobile-tools-menu-before-clipping.png`
(the reproduced defect — hints cut mid-letter at the clipped panel edge)
and `screenshots/mobile-tools-menu-after-portal.png` (final state — all
five rows complete, panel opening upward inside the viewport).

Desktop 1280×800 spot-checks after the fix: sidebar account menu
(x 23..263) and Tools menu (x 23..279) open upward fully visible as
body-level children — the account menu had also been losing ~8px to
the 240px sidebar edge before the portal. Composer tools (w-72) opens
upward at x 459..747, fully visible.

### Honest limits

- jsdom has no layout, so the clipping itself is not directly
  testable there; the regression tests pin the observable contract
  (body-level parent, in-portal click behavior, style-aware flip) and
  the geometry table above is the Chromium evidence.
- The style-aware rect mock in `menu.test.tsx` approximates a layout
  engine from inline `top`/`bottom`; it does not model `maxHeight`
  capping or horizontal clamping, which remain covered only by the
  browser checks.
