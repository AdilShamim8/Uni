# Verification Results — Universe Chat Frontend (Milestone 1)

Verified: 17 October 2026 · Environment: Node v24.21.0, npm 11.19.0

## Commands (run from `frontend/`)

| Check | Command | Result |
| --- | --- | --- |
| Lint (ESLint 9, typescript-eslint, react-hooks) | `npm run lint` | **Pass** — 0 errors, 0 warnings |
| Typecheck (strict TS, app + node configs) | `npm run typecheck` | **Pass** |
| Production build (Vite 5) | `npm run build` | **Pass** — chunked: app ≈ 97 KB, react ≈ 160 KB, markdown ≈ 337 KB (≈ 184 KB gzip total) |
| Interaction tests (Vitest + Testing Library) | `npm test` | **Pass** — 44/44 tests, 8 files |

### Interaction tests cover

- Send → deterministic streamed response; disabled sending on empty input.
- Stop generation → “Generation stopped” state; composer returns to send mode.
- `/fail` trigger → error state with retry affordance.
- Edit an earlier message → branches; original variant and its reply remain switchable (nothing destroyed).
- Regenerate → second variant; `< 1/2 >` switching both directions.
- Persistence: conversation saved under `universe:data` (schema v1) and restored after a simulated reload.
- Temporary chats excluded from every storage write; gone after reload.
- Search: opens via Ctrl+K, matches real message content, highlights the match, keyboard selection (Enter) opens the conversation, useful empty state.
- Settings: theme switch applied + persisted, density/text-size applied to the document root, send-key preference persisted, “Simulate connection test” produces the labeled demo result, Privacy & about copy renders, dialog closes on Escape.
- Unit: tree operations (active path, siblings, deepest-leaf switching, title derivation), persistence quarantine of malformed data, IME-safe Enter handling, attachment validation (type/size/empty/limits, preview-URL stripping).

## Headless-browser verification (agent-browser over `vite preview`)

Production build served locally at `http://localhost:4173`.

1. **No horizontal overflow** — `document.documentElement.scrollWidth` equals `clientWidth` at **375px**, **768px**, and **1440px** viewports.
2. **No console errors** — page `errors` empty across all visited states (empty state, conversation, streaming, settings dialog, research preview, mobile drawer).
3. **No outbound network calls** — the request log contains **only** same-origin asset requests (document, JS/CSS bundles, favicon SVG). No provider, analytics, or third-party request of any kind was observed. This was inspected from the browser network log, not assumed.
4. **Screenshots captured and inspected** — 12 screenshots (below) reviewed with a vision model for clipping, overlap, contrast, and composer obstruction: both batches reported **CLEAN**. Files live in `docs/screenshots/`:
   - `desktop-light-empty.png`, `desktop-light-conversation.png`, `desktop-light-streaming.png`, `desktop-light-response.png`, `desktop-light-research.png`
   - `desktop-dark-conversation.png`, `desktop-dark-settings.png`
   - `tablet-light-empty.png`, `tablet-dark-conversation.png` (768px)
   - `mobile-light-empty.png`, `mobile-dark-empty-sidebar.png`, `mobile-dark-drawer.png` (375px)
5. **Streaming observed live** — mid-stream caret visible, response completed with rendered Markdown table and message actions.
6. **Research preview run end-to-end** — brief → labeled simulated progress → fixture report with example sources.

Reproduce: `npm ci && npm run build && npm run preview`, then open http://localhost:4173 (theme can be forced via the `universe:theme` localStorage key or Settings → Appearance).

## Not verified (recorded honestly)

- **Real assistive-technology pass** (NVDA/VoiceOver narration) was not run. Keyboard operability, focus trapping, Escape handling, and accessible names are covered by code and interaction tests; a manual screen-reader session remains a recommended week-2 follow-up.
- **axe-core automated accessibility audit** was not included in this milestone's dependency set; token contrast pairs were chosen against WCAG 2.2 AA targets (see `design-tokens.md`) but not machine-audited.
- **OS-level IME** (actual Japanese/Chinese pinyin candidates) — the guard is unit-tested via simulated `isComposing` events; a real-IME smoke test is a manual follow-up.
- **Real device testing** (iOS Safari, Android Chrome) — responsive behavior was verified in headless Chromium viewports only.
- Cross-browser matrix (Firefox/WebKit) — deferred to week 2.
