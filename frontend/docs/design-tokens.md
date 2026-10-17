# Universe Design Tokens

Date: 17 October 2026 · These tokens are Universe's own design choices (see `reference-audit.md` for what was and was not observable on reference surfaces).

## Principles

- Quiet, warm-neutral light surfaces; charcoal dark surfaces; one muted violet accent used for selection, focus, and identity.
- Semantic tokens only — components reference `--c-*` variables through Tailwind theme aliases (`bg-canvas`, `text-ink`, `border-line`, …), never scattered hex values.
- No decorative gradients, no glass effects, restrained shadows, 12–18px surface radii.
- System font stack; comfortable line height; consistent icon weight (Lucide, ISC license).

## Color tokens

| Token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `--c-canvas` | `#ffffff` | `#1c1c21` | Main conversation background |
| `--c-panel` | `#faf9f7` | `#151519` | Sidebar background (warm neutral / charcoal) |
| `--c-subtle` | `#f1efe9` | `#232329` | Hover fills, inline code background |
| `--c-raised` | `#ffffff` | `#232329` | Composer, cards |
| `--c-overlay` | `#ffffff` | `#2a2a31` | Menus, tooltips, popovers |
| `--c-inverse` | `#26241f` | `#eceae6` | Inverse surfaces (badges) |
| `--c-line` | `#e7e4dc` | `#2e2e36` | Subtle borders, dividers |
| `--c-line-strong` | `#d5d1c7` | `#3c3c45` | Emphasized borders |
| `--c-ink` | `#26241f` | `#eceae6` | Primary text |
| `--c-ink-soft` | `#5d5a52` | `#a8a49b` | Secondary text |
| `--c-ink-faint` | `#8b867a` | `#7c786f` | Tertiary text, placeholders |
| `--c-ink-inverse` | `#f5f4f0` | `#1c1c21` | Text on inverse/accent surfaces |
| `--c-accent` | `#6d28d9` | `#b39dfa` | Accent (muted violet) — selection, focus, links, primary actions |
| `--c-accent-strong` | `#5b21b6` | `#c7b8fd` | Accent hover/active |
| `--c-accent-soft` | `#efeaf9` | `#2e2a40` | Selected-item fills, chips |
| `--c-danger` / `--c-danger-soft` | `#b3261e` / `#fdeeec` | `#f18a84` / `#3a2422` | Destructive actions, errors |
| `--c-success` / `--c-success-soft` | `#1b7f4d` / `#e9f5ee` | `#6fcf97` / `#1d2f26` | Positive status |
| `--c-warning` / `--c-warning-soft` | `#92600a` / `#fdf3e2` | `#e5b567` / `#382c1a` | Cautions |
| `--c-scrim` | `rgba(38,36,31,.42)` | `rgba(0,0,0,.55)` | Dialog/drawer scrims |
| `--c-code-*` | see `tokens.css` | see `tokens.css` | Syntax highlighting (keyword/string/comment/number) |

Contrast targets: body text and accent-on-light meet WCAG 2.2 AA (4.5:1); the light accent `#6d28d9` on white ≈ 7.3:1, dark accent `#b39dfa` on `#1c1c21` ≈ 7:1. Secondary text pairs were chosen to stay ≥ 4.5:1 on their surfaces.

## Geometry

| Token / rule | Value |
| --- | --- |
| Sidebar expanded | 264px (`--w-sidebar`) |
| Sidebar collapsed rail | 64px (`--w-rail`) |
| Reading column | 760px max (`--w-column`) |
| Radii | inputs/controls 10px, cards/bubbles 12px, composer/dialogs 16px (within the 12–18px band) |
| Shadows | `--shadow-soft` (dropdowns), `--shadow-raised` (dialogs) — low, diffuse |

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
