# ReWoo design reuse — home page restyle

This wave borrows the visual language of the ReWoo project
(https://github.com/AdilShamim8/ReWoo, MIT) for the Uni marketing home
page. Same author, MIT-compatible; attribution kept in
`third_party/licenses/rewwo/`.

## What was taken

| Asset | Source in ReWoo | Destination in Uni |
| --- | --- | --- |
| DM Sans + Sora fonts | `assets/fonts/*.ttf` + OFL notices | `frontend/public/fonts/` (self-hosted, `@font-face` in `home.css`) |
| Helper mascot shapes | `assets/helpers/{woo,scout,quill,tally,hush}.svg` | `frontend/public/helpers/{nova,atlas,echo,prism,vault}.svg` — same outlines, recolored to Uni's palette, renamed to Uni's five destinations |
| Home page layout & CSS | `styles.css` (marketing sections) | `frontend/src/features/home/home.css` — rewritten as scoped styles under `.uni-home`, adapted to Uni copy and Uni routes |
| Section compositions | `index.html` (hero, audience band, use-case tabs, helper grid, journey, context board, trace, time calculator, guides, FAQ, closing, footer) | `frontend/src/features/home/HomePage.tsx` — same compositions, Uni-specific copy, links into the real app routes |

## What was NOT taken

- ReWoo's `script.js` behaviors (localStorage demo context, guided
  demo templates, learning progress) — the real app already has the
  real thing (conversations, tasks, agents, plugins, library).
- ReWoo's Python backend, console, order-desk pages, pricing, contact.
- No ReWoo branding: every visible string says Uni; characters are
  Nova, Atlas, Echo, Prism, Vault.

## Character / destination mapping

| Uni destination | Character | ReWoo shape origin | Palette |
| --- | --- | --- | --- |
| Chat | Nova | `woo.svg` | purple `#5443c9 → #cdc0ff` |
| Work | Atlas | `scout.svg` | blue `#2f5cbd → #c3dbfb` |
| Agents | Echo | `quill.svg` | coral `#c05f52 → #ffc3b4` |
| Plugins | Prism | `tally.svg` | green `#41795a → #d1ecce` |
| Library | Vault | `hush.svg` | yellow `#a37d24 → #f4dfa4` |

## Route impact

`/` becomes the marketing home page; Chat moved from `/` to `/chat`
(`/c/:id` unchanged). All internal links, sidebar destinations, the
mobile destination bar, the service worker shell route, and the test
helpers were updated together. The dashboard itself (Chat / Work /
Agents / Plugins / Library) keeps its structure and behavior; only the
empty-chat welcome was restyled to speak the same design language.
