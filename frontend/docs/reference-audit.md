# Reference Audit — Universe Chat Frontend

Audit date: 17 October 2026 · Auditor: Universe frontend milestone 1

## Method

This audit follows the evidence-first loop used throughout the milestone: **observe → explain → specify → implement → verify**. Every design decision below traces to either (a) something actually observed on a publicly accessible surface, (b) an officially documented feature, or (c) an explicit, labeled design assumption. REA (github.com/morluto/rea, MIT) was consulted as an *investigation-methodology reference only* — it is not a runtime dependency of Universe, nothing from it is bundled, and no binary or hidden-service inspection was performed for this browser-UI task.

Repository state was re-checked before implementation (see "Repository inspection" below). Interactive-product references were re-fetched on the audit date; what follows records what was actually returned. Screens or flows that require sign-in or a paid plan were **not** inspected and are marked as such. Where a reference surface was unavailable, Universe proceeds with an original, clearly labeled design instead of imitating unverifiable details.

## Repository inspection (target: AdilShamim8/Universe)

| Check | Result |
| --- | --- |
| Default branch | `main` |
| Tracked files | `README.md` only (`## Universe ✨`) |
| History note | Prior frontend history exists (chat UX, Tailwind v4, "ReWoo" branding) but all files were removed in commit `b9047067e` ("chore: remove all files and folders"). Nothing from that history is reused in this milestone. |
| LICENSE / notices | None present at root |
| AGENTS.md / tooling / lockfiles / CI | None present |
| Implication | No established frontend stack to follow; the milestone scaffolds a fresh one (React + TypeScript + Vite + Tailwind). Root changes stay limited to README notes, ignore rules, a frontend-scoped license file, and a frontend CI workflow. |

## Audit table

Legend for **confidence**: High = directly observed on a public surface; Medium = documented or partially observed; Low = inferred or unavailable → original design. **Implementation status** refers to this milestone's code.

| Surface | Evidence / link (date) | Observed behavior | Universe interpretation | Confidence | Implementation status |
| --- | --- | --- | --- | --- | --- |
| Overall layout (signed-out landing) | https://chatgpt.com/ (2026-10-17) | Top navigation with entries (New chat, Images, Plugins, Deep research, plans/pricing, Help, Settings); centered prompt area; logged-out page is mostly auth marketing | Conversation-first layout: collapsible sidebar (~264px expanded / ~64px rail), restrained top bar, centered reading column (~760px), composer at bottom. Original geometry and tokens, not copied values. | Medium (authenticated chat surface not visually inspected) | Implemented — original design |
| Empty state | chatgpt.com landing (2026-10-17) | Central prompt "What are you working on? Where should we begin?" with photo/web-search options | Original welcome copy + original suggestion chips; no copied marketing text | High for structure, original copy | Implemented |
| Composer basics | learn.chatgpt.com/docs/features index (2026-10-17): "Composer Predictions", "Commands"; public landing file-upload area | Composer with attachments and tool affordances; keyboard commands documented (details behind sign-in/docs pages) | Multiline auto-growing textarea; Enter sends, Shift+Enter newline; IME-composition guard; Ctrl/Cmd+Enter mode configurable in settings | Medium (exact shortcuts on authenticated surface not verified) | Implemented |
| Attachments | Public landing upload area (2026-10-17): image formats listed (.avif, .bmp, .gif, .heic, .heif, .jpeg, .jpg, .png, .webp) | Image upload supported pre-auth for the composer widget | Local-only attachments: file picker + drag/drop, size/type/count validation, chips, image previews, removal, clear errors; attachments are never uploaded or analyzed in this prototype | High for the observable widget | Implemented (local only) |
| Tools / advanced workflows | Landing nav entries "Images", "Deep research", "Plugins" (2026-10-17); docs index "Tools and integrations" | Tool affordances surfaced near the composer | Tool picker with visible chips (Search, Research, Images, Voice, Canvas); tool availability driven by a capability registry on the selected model; previews clearly labeled simulated | Medium | Implemented as labeled local previews |
| Conversation management | learn.chatgpt.com/docs/features index "Settings", "Commands" (2026-10-17); detailed pages sign-in gated | Not directly observable; feature names documented | Original design: create/select/rename/pin/archive/delete with undo, date-grouped history, content search with keyboard navigation | Low → original design | Implemented |
| Temporary chats | Not found in accessible docs (2026-10-17) | Not verifiable | Universe original: explicit "temporary chat" toggle; conversation kept in memory only, never persisted, badge in top bar | Low → original design | Implemented |
| Markdown / code rendering | Not publicly inspectable (sign-in gated) | Not verifiable | Markdown (GFM tables, lists, fenced code) with syntax highlighting, copy buttons, safe links (target=_blank + rel), raw HTML disabled | Low → original design | Implemented |
| Model / provider selection | Landing shows plan-tier marketing only (2026-10-17) | Provider/model UI not accessible signed-out | Local provider profiles (OpenAI, Anthropic, Google, OpenAI-compatible, Local as configuration concepts) with demo models, capability labels, simulated connection test; no real model names, prices, or claims | Medium | Implemented |
| Settings screens | Docs index lists a Settings section; content sign-in gated (2026-10-17) | Not verifiable | Original settings dialog: appearance (theme/density/text size), chat preferences, data tools, provider profiles, privacy/about | Low → original design | Implemented |
| Share links | Not accessible (authenticated feature) | Not verifiable | Explicitly labeled "unavailable in this local prototype" with a working local Markdown export offered instead | Low → honest stub with explanation | Implemented |
| REA methodology | https://github.com/morluto/rea (2026-10-17); README + MIT LICENSE | Agent inspects target → findings carry evidence → follow-up/verify loop | Adopted as the working loop for this audit and milestone; REA code is not used, bundled, or depended on | High | Applied (process only) |

## Explicitly not inspected (no claims made)

- Authenticated or paid surfaces of any third-party product (chat workspace, premium tools, SSO flows).
- Native/mobile apps.
- Any third-party source code, stylesheets, private endpoints, logos, or marketing copy. Nothing was extracted or reused; all Universe code, copy, tokens, and the product mark are original.

## Missing references and assumptions

1. Keyboard shortcut details and settings layouts sit behind sign-in — Universe uses common, documented-in-README conventions (Enter/Shift+Enter, Ctrl/Cmd+K search, Esc to close dialogs) and original layouts.
2. Temporary-chat and shared-link behaviors could not be re-verified publicly — both are original designs, clearly labeled.
3. Mobile-app-specific patterns are unverified; Universe applies standard responsive behavior (drawer sidebar at < 1024px) and lists responsive checks in `verification.md`.
