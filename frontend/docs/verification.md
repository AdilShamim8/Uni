# Verification Results — Universe Chat Frontend (Milestone 1)

Verified: 17 October 2026 · Environment: Node v24.21.0, npm 11.19.0

## Commands (run from `frontend/`)

| Check | Command | Result |
| --- | --- | --- |
| Lint (ESLint 9, typescript-eslint, react-hooks) | `npm run lint` | **Pass** — 0 errors, 0 warnings |
| Typecheck (strict TS, app + node configs) | `npm run typecheck` | **Pass** |
| Production build (Vite 5) | `npm run build` | **Pass** — chunked: app ≈ 97 KB, react ≈ 160 KB, markdown ≈ 337 KB (≈ 184 KB gzip total) |
| Interaction tests (Vitest + Testing Library) | `npm test` | **Pass** — 65/65 tests, 9 files |

### Interaction tests cover

- Send → deterministic streamed response; disabled sending on empty input.
- Stop generation → “Generation stopped” state; composer returns to send mode.
- `/fail` trigger → error state with retry affordance.
- Edit an earlier message → branches; original variant and its reply remain switchable (nothing destroyed).
- Regenerate → second variant; `< 1/2 >` switching both directions.
- Persistence: conversation saved under `universe:data` (schema v1) and restored after a simulated reload.
- Temporary chats excluded from every storage write; gone after reload.
- Search: opens via Ctrl+K, matches real message content, highlights the match, keyboard selection (Enter) opens the conversation, useful empty state.
- Settings: theme switch applied + persisted, density/text-size applied to the document root, reduced-transparency toggle flips `data-transparency`, send-key preference persisted, connect flow persists a credential privately while export stays key-free, 401 keeps the key out of storage, Privacy & about copy renders, dialog closes on Escape.
- BYOK: credential storage (round-trip, malformed-entry quarantine, corrupt payload, clear); connection testing (per-protocol URLs, empty-key/URL rejection without network, success with sorted discovered models, Anthropic headers, 401/404/429 diagnostics, CORS/network copy); live adapter (OpenAI + Anthropic SSE streams, history/persona/attachment-name system prompt, 401 as `provider_error`, pre-abort as clean stop); store routing (connected provider streams from its endpoint with the bearer key; unconnected provider never touches `fetch`).
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

## BYOK end-to-end verification (17 October 2026)

Verified against a **real local OpenAI-compatible server** (fake provider on
`http://localhost:4571`, CORS-enabled) through the production build — not mocks:

1. **Add provider profile** — form accepts label + endpoint URL, suggests base URLs per provider type.
2. **Connect with an API key** — `GET /v1/models` with `Authorization: Bearer` returned 200; UI showed *Connected*, latency, masked key tail, and the 2 discovered models as activatable chips.
3. **Credential hygiene** — key stored only under `universe:credentials:v1`; `universe:data` (export path) contains no credentials. A second profile connected with a wrong key showed the honest *401 Unauthorized* diagnostic and **did not persist** the bad key.
4. **Live chat** — sending a message produced a real SSE stream from the endpoint (status line “Live reply from My Local Endpoint”), rendered Markdown bold in the streamed text, top bar flipped from the Demo badge to the green **Live** badge.
5. **Reload persistence** — after a full page reload the credential survived, the Live badge returned, and a second message streamed live again (second `POST /v1/chat/completions` observed).
6. **Network isolation** — the request log contained only same-origin assets plus the four expected calls to the user-configured endpoint (OPTIONS + GET models, OPTIONS + POST completions). Nothing else.
7. **Model picker** — connected provider listed with a status dot and “· live”; its models carry a Live hint; demo providers keep their Demo hints.
8. **Reduced transparency** — Settings toggle flips `data-transparency` between `on`/`off` live.
9. **Zero console errors / page errors** throughout; no horizontal overflow at 375px or 1440px.

Vision QA on the BYOK screenshots: providers/settings **9/10 PASS**, live chat light **9.5/10 PASS**, dark mode with Live badge **9.5/10 PASS** (files: `download/byok-verify/01…08` on the verification machine).

Honest limits for BYOK: tested against OpenAI-shaped and Anthropic-shaped
protocols via local servers; real third-party endpoints additionally depend
on each provider's CORS policy (surfaced honestly in error copy when
blocked). Streaming tool-calls and multimodal content are not implemented.

## Not verified (recorded honestly)

- **Real assistive-technology pass** (NVDA/VoiceOver narration) was not run. Keyboard operability, focus trapping, Escape handling, and accessible names are covered by code and interaction tests; a manual screen-reader session remains a recommended week-2 follow-up.
- **axe-core automated accessibility audit** was not included in this milestone's dependency set; token contrast pairs were chosen against WCAG 2.2 AA targets (see `design-tokens.md`) but not machine-audited.
- **OS-level IME** (actual Japanese/Chinese pinyin candidates) — the guard is unit-tested via simulated `isComposing` events; a real-IME smoke test is a manual follow-up.
- **Real device testing** (iOS Safari, Android Chrome) — responsive behavior was verified in headless Chromium viewports only.
- Cross-browser matrix (Firefox/WebKit) — deferred to week 2.
