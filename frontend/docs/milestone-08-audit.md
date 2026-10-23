# Milestone 08 — long-conversation performance audit

Scope: roadmap Week 2 item — "performance pass on long conversations
(windowed rendering **if measurements justify it**)". This audit reproduces
the cost first, then commits to fixes only where the numbers justify them.

Base: `main` at `3ad6b95c3` (after PR #19). Branch:
`feat/m08-long-conversation-performance`.

## Method

Harness: `scripts/perf_long_conversation.py` (committed with this audit so
the numbers are reproducible). It serves no files itself — run
`npm run build && npx vite preview --port 4180`, then point it at the
preview URL. It:

1. boots the app once in a scratch browser context to capture a
   schema-valid `universe:data` seed;
2. replaces the first conversation with a synthetic 600-message transcript
   (alternating user/assistant, markdown with lists, bold, and a code fence
   on every fifth reply; 45 s between messages so time separators appear);
3. installs that state in a **fresh** context before any app script runs
   (the running app would otherwise persist its in-memory state over a late
   write — the first harness draft hit exactly that race and silently
   benchmarked the 4-message demo seed);
4. deep-links to `/c/:id` and measures, with a buffered `longtask`
   PerformanceObserver and a rAF-based mount probe:
   - **mount** — navigationStart → message count rendered and stable;
   - **stream** — one reply streamed by the demo adapter (26 ms word
     chunks) sampled over 6 s: long tasks + frame pacing;
   - **scroll** — 40 × 700 px upward steps through the history.

Environment: headless Chromium 1200, viewport 1440×900, single runs. These
are comparative engineering numbers, not lab statistics; each figure below
was reproduced twice and agreed within a few percent.

## Baseline (before, 600 messages)

| Phase | Result |
| --- | --- |
| Mount | transcript stable at **1691 ms** (second run 1723 ms); long tasks: 2, **1425 ms** total, longest single block **1356 ms**; **19,506 DOM nodes** in the transcript; heap 66–74 MB |
| Stream (6 s) | **69 long tasks, 5047 ms blocked** (second run 65 / 5094 ms); median frame **83.3 ms (~12 fps)**, p95 100 ms, max 216.7 ms |
| Scroll (40 steps) | 30–34 long tasks, 2.1–2.5 s blocked |

For calibration: the same harness on the 4-message demo conversation mounts
in ~137 ms — the cost above is the transcript, not app boot.

## Findings

Evidence markers: **BR** = reproduced in the browser against the production
build; **SRC** = confirmed by reading the current source.

| ID | Finding | Evidence |
| --- | --- | --- |
| F14 | Every transcript update re-renders every message component. A streamed reply re-executes all 600 unmemoized `MessageItem`s and reconciles their ~19.5k DOM nodes on every token; a scroll past the near-bottom threshold does the same via `setNearBottom`. | **BR**: 69 long tasks / 5.0 s of blocked main thread during one 6 s streamed reply; median frame 83.3 ms. **SRC**: `MessageList` maps the full `activePath` with an unmemoized `MessageItem`; `updateNode` patches one node per token but gives the whole conversation a new identity, so every item re-renders; `handleScroll` flips `nearBottom` state on the same list. `Markdown` itself is already memoized on its content (so the remark/rehype pipeline does *not* re-run) — the measured cost is the per-token reconciliation of unchanged messages. |
| F14b | Per-update selector work is quadratic. Each `MessageItem` calls `siblingsOf(conversation, node.id)`, which filters **all** nodes — N items × O(N) per store update. | **SRC**: `MessageItem.tsx` (both message kinds) + `conversationTree.siblingsOf`. |
| F15 | Initial mount is unbounded: the whole active path mounts in one commit, so cost grows linearly with history and nothing bounds the rendered set. | **BR**: single 1356 ms main-thread block, 19,506 DOM nodes, 66–74 MB heap at mount for 600 messages. **SRC**: `MessageList`/`ThreadView` render `timedPath`/`entries` in full; no windowing anywhere. |

Dispositions: F14 and F14b are one fix (stable per-item inputs + memo —
`Markdown`'s existing memo then shields the pipeline completely, and the
reconciliation itself stops at the memo boundary);
F15 is the windowing fix the roadmap made conditional on exactly these
measurements — the condition is met (1.4 s freeze and 12 fps streaming are
user-visible defects, not theory).

## Plan (one commit each, gated: typecheck, lint, tests, build)

1. **Memoized transcript updates (F14, F14b).** A domain `variantPositions`
   map computes every message's variant index/count in one pass, replacing
   the per-item O(N) sibling scans; `MessageItem` switches to stable
   primitive inputs (`conversationId`, `variantIndex`, `variantCount`) and
   `React.memo`. During streaming, only the message being written
   re-renders — unchanged messages bail at the memo boundary with zero
   reconciliation work.
2. **Windowed transcript rendering (F15).** The transcript mounts a tail
   window (newest items); older history materializes block-by-block as the
   reader scrolls up, with scroll compensation so the visible position
   never jumps; a rendered cap bounds the DOM by collapsing leading blocks
   that are fully above the viewport. Environments without layout
   measurements (jsdom) fail open and render everything, so tests and
   screen-reader flows on small transcripts are unchanged.

## Verification plan

- Unit tests for the window math (initial window, extension, collapse
  guard, fail-open) and for variant positions with real branching.
- Interaction tests: full suite green — existing transcript tests must pass
  unchanged, proving the fail-open default.
- Browser re-run of this exact benchmark on the production build; targets:
  mount long-task removed (bounded by the tail window), streaming median
  frame back at ~16.7 ms, scroll long tasks bounded per block.
- Manual journey: jump-to-latest, edit/branch/regenerate, delete-with-undo,
  export, and search on a 600-message conversation.

## Honest limits

- Off-screen history is not in the DOM (and therefore not in the
  accessibility tree) while windowed — the standard virtualized-transcript
  tradeoff; the tail window and on-demand materialization keep everything
  reachable by scrolling, and small transcripts (< 80 items) never window.
- The benchmark measures the demo adapter's local streaming; a live
  provider changes the chunk cadence, not the per-update render cost.
- Frame pacing in headless Chromium is indicative, not a substitute for
  real-device profiling; the long-task totals are the robust metric.
