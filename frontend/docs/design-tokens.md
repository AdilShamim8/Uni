# Universe Design Tokens

Date: 17 October 2026 · These tokens are Universe's own design choices (see `reference-audit.md` for what was and was not observable on reference surfaces).

## Principles

- Bright porcelain light surfaces; deep graphite dark surfaces; one blue-lilac accent used for selection, focus, and identity.
- Semantic tokens only — components reference `--c-*` variables through Tailwind theme aliases (`bg-canvas`, `text-ink`, `border-line`, …), never scattered hex values.
- Floating glass materials for navigation and floating controls only (restrained translucency, 1px edge highlight, grounded shadow; opaque fallbacks); documents, message text, forms, and tables stay opaque.
- One static, low-contrast radial wash behind the empty-chat composition only; no moving gradients, star fields, particles, or fake 3D.
- Geometry: 14px shell inset, 12px control radius, 18px content groups, 24px major surfaces, 28px composer; behavior-timed motion (press 120 / select 180 / menu 210 / inspector 250 / transition 270 / status 180 ms).
- System font stack; comfortable line height; consistent icon weight (Lucide, ISC license).

## Color tokens

| Token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `--c-canvas` | `#f7f8fa` | `#0d0f14` | Workspace canvas (porcelain / deep graphite) |
| `--c-panel` | `#ffffff` | `#191c23` | Primary content surface |
| `--c-subtle` | `#eceef2` | `#232732` | Hover fills, inline code background |
| `--c-raised` | `#ffffff` | `#191c23` | Composer, cards |
| `--c-overlay` | `#ffffff` | `#1b1e26` | Menus, tooltips, popovers |
| `--c-inverse` | `#15171c` | `#f5f7fc` | Inverse surfaces (badges) |
| `--c-line` | `#e5e7ec` | `#262a35` | Subtle borders, dividers |
| `--c-line-strong` | `#d5d8e0` | `#363b48` | Emphasized borders |
| `--c-ink` | `#15171c` | `#f5f7fc` | Primary text |
| `--c-ink-soft` | `#565c68` | `#b2bac9` | Secondary text |
| `--c-ink-faint` | `#757b88` | `#8d95a5` | Tertiary text, placeholders |
| `--c-ink-inverse` | `#ffffff` | `#15171c` | Text on inverse/accent surfaces |
| `--c-accent` | `#6555d9` | `#b3a8ff` | Accent (blue-lilac) — selection, focus, links, primary actions |
| `--c-accent-strong` | `#5848c4` | `#c6bcff` | Accent hover/active |
| `--c-accent-soft` | `#efedfb` | `#2a2742` | Selected-item fills, chips |
| `--c-danger` / `--c-danger-soft` | `#c9352c` / `#fdeeec` | `#f08a80` / `#3a2422` | Destructive actions, errors |
| `--c-success` / `--c-success-soft` | `#1d7f4e` / `#e8f5ee` | `#74d09a` / `#1c2f25` | Positive status |
| `--c-warning` / `--c-warning-soft` | `#8a5a08` / `#fdf3e1` | `#e3b565` / `#362a18` | Cautions |
| `--c-scrim` | `rgba(21,23,28,.4)` | `rgba(0,0,0,.6)` | Dialog/drawer scrims |
| `--c-code-*` | see `tokens.css` | see `tokens.css` | Syntax highlighting (keyword/string/comment/number) |
| `--mat-*` | see `tokens.css` | see `tokens.css` | Navigation/floating glass materials (translucent, opaque fallbacks) |
| `--welcome-wash-a/b` | see `tokens.css` | see `tokens.css` | Static radial hint behind the empty-chat composition only |

Contrast targets: body text and accent-on-light meet WCAG 2.2 AA (4.5:1); the light accent `#6555d9` on white ≈ 6.6:1, dark accent `#b3a8ff` on `#0d0f14` ≈ 8:1. Secondary text pairs were chosen to stay ≥ 4.5:1 on their surfaces. These starting values are design targets, not an accessibility certification — see `milestone-05-design.md`.

## Geometry

| Token / rule | Value |
| --- | --- |
| Sidebar expanded | 256px (`--w-sidebar`) — inside the 248–264px band |
| Sidebar collapsed rail | 64px (`--w-rail`) |
| Reading column | 768px max (`--w-column`) — inside the 720–800px band |
| Inspector panel | default 420px (`--w-inspector`), resizable 360–560px (`--w-inspector-min/max`) |
| Radii | controls 12px, groups 16px, composer/overlays 24px (`--r-control/group/composer/overlay`) |
| Shadows | `--shadow-soft` (dropdowns), `--shadow-raised` (dialogs) — low, diffuse |
| Motion | 140–220ms transform/opacity (`--motion-fast/normal`), reduced-motion honored |

## Typography

- Sans: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif`
- Mono: `ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`
- Body 15–17px (user-selectable), line-height 1.6–1.7; headings modest and few in chat content.

## Density and text size

- `[data-density="comfortable"]` (default) vs `[data-density="compact"]`: adjusts `--pad-list-item`, `--gap-chat`, `--pad-compose` (e.g. list rows 34px → 28px padding rhythm).
- `[data-textsize="s|m|l"]`: root font-size 15 / 16 / 17px; rem-based spacing scales with it.

## Motion

- Transitions 120–180ms ease-out on hover/focus/appearance.
- `@media (prefers-reduced-motion: reduce)`: animations/transitions collapse to ~0ms and `scroll-behavior` becomes auto.
- Streaming caret and voice bars pause under reduced motion.

## Theme application

- `<html data-theme="light|dark">` drives every token; Tailwind `dark:` variant is bound to the same attribute.
- Theme resolution order: stored preference (`light`/`dark`/`system`) → OS `prefers-color-scheme` when `system` → live re-sync on OS changes.
- An inline boot snippet in `index.html` applies `data-theme` before React mounts to avoid a flash.

---

## Milestone 3 additions

The token vocabulary is unchanged (surface, ink, accent, status, radius,
spacing, motion); Milestone 3 extends its *application* rather than adding
new tokens:

- **Status pills** (`components/ui/StatusPill.tsx`) render every status in
  the product from one component with five semantic tones (neutral, accent,
  success, warning, danger) and an optional live dot. Task statuses map to
  tones in `domain/taskMachine.ts` — a single status source drives the
  Work shell, workspace header, sidebar, and assistant view.
- **Navigation hierarchy:** the sidebar keeps its translucent material
  (`--mat-sidebar`), while Work/Agents/Library content surfaces stay opaque
  (`--c-raised` / `--c-panel`) for readable long-form work. Blur remains
  limited to overlays and navigation, with the existing opaque fallback
  under Reduce transparency.
- **Menu collisions:** panels flip and scroll past `max-height: 360px`
  using viewport math only — no new tokens; motion stays within
  `--motion-fast`/`--motion-normal` (140–200 ms).
- **Filter chips** reuse the pill radius (`--r-control` scale) and scroll
  horizontally on narrow screens instead of wrapping unevenly.
- **Touch targets** in the new destinations keep `min-touch` (≥ 44 px) on
  all rows, tabs, chips, and form controls.
