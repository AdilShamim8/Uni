# Milestone 05 — Apple-inspired visual reset

Date: 18 October 2026 · Branch: `feat/apple-inspired-visual-reset`
Scope: a visibly new, cohesive composition, navigation, typography, surfaces,
and interaction system across every destination — plus one bounded live
capability (AI drafting in Work) — while preserving the existing product.

## The direction

An **airy, precise workspace with floating glass navigation, solid readable
content, expressive typography, and fluid transitions.** Interpretation of
Apple's public design references (WWDC25 session 219; Human Interface
Guidelines "Materials") is original web work: CSS blur is only an
approximation of the platform material, and no native rendering parity is
claimed. No Apple artwork, fonts, or marketing content was used.

## Before → after decisions

| Area | Before (audited at `e038288d5`) | After |
| --- | --- | --- |
| Shell | Flush full-height sidebar with a hairline border-right; one continuous flat background | Floating glass sidebar inset 14px from the viewport, 240px wide, 24px radius, edge highlight + grounded shadow; workspace keeps its own padding |
| Mobile nav | Full-width hairline bottom bar | Rounded glass pill inset from the viewport edges, clearing the home-indicator safe area; drawer is the same floating rounded panel |
| Toolbar | Full-width hairline bar, tiny icons scattered | One shared `PageToolbar` (60px, 18px radius, glass) per destination; related icon actions grouped in one `ToolbarGroup` surface |
| Navigation list | Inset grouped card that read like a settings list | Flat icon/label list with one confident selection treatment (accent pill, semibold, 180ms) |
| Primary action | Interactive temporary-chat span nested inside the New-chat button | Separate sibling buttons with correct semantics (regression-tested) |
| Welcome | 26–34px headline, four dominant outlined cards above the composer, left-aligned mark, "bring any provider" claim | Deliberately centered composition: mark, 44–52px headline ("What would you like to create?"), one sentence, composer as the primary object, compact starter chips, genuine recents, accurate supported-provider wording |
| Color | Flat gray/lavender (`#f5f5f7` / `#111113`), violet accent | Bright porcelain (`#F7F8FA` canvas, `#FFFFFF` content) / deep graphite (`#0D0F14` canvas, `#191C23` panels) with the blue-lilac accent pair `#6555D9` / `#B3A8FF`; dark materials lift toward the panel tone so layers separate |
| Typography | 11–13px gray uppercase labels carrying hierarchy | 16.5px input text, 15px titles, 14px nav/controls, 12px sentence-case section labels; hierarchy from size and weight, not case |
| Composer | 24px radius, 16px interior, 36px send | 28px radius, 20px interior, 16.5px text, 40px send/stop with 120ms press compression; focus strengthens the edge gently (border + soft ring, no shift) |
| Motion | Two generic durations | Behavior-timed tokens: press 120 · select 180 · menu 210 · inspector 250 · layout transition 270 · status 180 (ms); reduced motion preserved |
| Welcome backdrop | None | One static, low-contrast radial wash of blue/lilac behind the empty-chat composition only (`--welcome-wash-a/b`); reading and editing views never render it |
| Menus | Ancestor-relative absolute panels | Viewport-fixed panels positioned from the trigger rect (pre-paint flip/clamp/cap, reposition-on-scroll) — no rounded or overflow-hidden ancestor can clip a menu |

Glass surfaces are reserved for navigation and floating controls; documents,
message text, forms, and tables stay opaque. Opaque fallbacks apply when
`backdrop-filter` is unsupported, when Reduce transparency is on, or when the
OS requests it. Materials are never stacked.

## The one real missing feature: live AI drafting in Work

After the visual foundation passed screenshot inspection, Work gained a
bounded **AI draft** mode on the existing BYOK `ChatAdapter` — a single live
text-drafting request, not an autonomous runtime:

- Configuration: connected model only (providers without a connected key are
  not selectable), goal, optional instructions, optional explicitly selected
  text context. The form shows the effective model, exactly what is included,
  and the charge warning; nothing is sent until the explicit Generate draft.
- Execution: run-scoped events for request start, incoming content, stop,
  failure, and readiness. Stop and failure preserve partial content for
  review (flagged `stoppedPartial`); retry and regenerate are explicit. A
  reload demotes a live request to paused with an honest note — the network
  handle existed only in the closed page.
- Isolation: one controller per task, separate from chat, comparison, and
  other tasks. Credentials are read at request time inside the streaming
  closure and never persisted (asserted by test against the saved slice).
- Provenance: reports and saved Library artifacts carry
  `provider-generated` with the model snapshot and context-included flag;
  the output footer states that no external sources were retrieved and no
  citations were added. Demo remains an explicit alternative in the same form.
- Migrations: `WorkTask.mode/draftConfig/error`, `TaskReport.provenance/
  generatedBy/contextIncluded/stoppedPartial`, `Artifact.generatedBy` — old
  demo tasks and artifacts load untouched with normalized defaults.

## Verification evidence

Commands (all green at `0fae1d028`): `npm run typecheck` · `npm run lint`
(0 problems) · `npx vitest run` (**196/196**, incl. the new 12-test AI-draft
suite and the sibling-controls regression) · `npm run build`.

Measured geometry (headless Chromium, 1440×900): sidebar rect left/top 14px,
width 240px, radius 24px, translucent background 0.76 alpha; toolbar 60px/18px
radius; composer radius 28px; headline 51.2px weight 600; no horizontal
overflow at 390 / 768 / 1440px or at 200% zoom. Zero console errors; zero
non-local network requests. Keyboard pass: 15 Tabs reach interactive content
with a visible 2px focus outline; Ctrl+K opens the command palette and
Escape closes it. Both themes screenshotted at desktop/mobile; a vision-model
review of the eight-view matrix confirmed the floating sidebar, centered
welcome, layered dark surfaces, and overall cohesion, with remaining
nitpicks (sidebar-name truncation, bottom-bar inset) accepted as intended
behavior.

Screenshots: `download/design-slice/final-*.png` (12 final views).

## Not claimed

- No native Liquid Glass rendering parity — CSS blur is an approximation.
- No new search/image/voice/scheduling services; those remain accurately
  labeled in the backlog and their screens.
- Real iOS/Safari was not available in this environment; coverage is
  Chromium desktop/mobile/tablet viewports only.
- Visual QA used static screenshots plus DOM measurement; animation feel was
  implemented to the timing table but not video-verified.
