# Universe — Chat Frontend (Milestone 1)

An independent, open-source AI workspace. This milestone delivers the chat
interface, shared application shell, and settings UI as a **local demo
prototype**: everything runs in your browser, responses come from a
deterministic mock adapter, and no provider, backend, or account is involved.

## Quick start

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Typecheck + production build (output in `dist/`) |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint (typescript-eslint, react-hooks) |
| `npm run typecheck` | Strict TypeScript, app + node configs |
| `npm run test` | Vitest interaction/unit tests |
| `npm run test:watch` | Tests in watch mode |

Requires Node ≥ 20. Dependencies are pinned through `package-lock.json`.

## Architecture

```
src/
  app/            # App root, routing, theme provider
  components/     # ui/ primitives (dialog, menu, fields, toast…) + layout shell
  features/
    chat/         # sidebar, top bar, composer, messages, search, export
    settings/     # appearance, chat prefs, data tools, provider profiles
    previews/     # research, images, voice, canvas, data, presets, coming-soon
  domain/         # conversation tree, types, adapter contract, grouping
  services/
    mock/         # deterministic chat adapter + all fixtures
    storage/      # versioned localStorage with safe recovery
  state/          # zustand store (actions, persistence wiring, selectors)
  styles/         # design tokens + base styles
tests/            # interaction and unit tests
docs/             # audit, tokens, model, roadmap, verification, status
```

Key decisions (full rationale in `docs/`):

- **Message tree, not a list.** Editing a user message or regenerating a
  response creates siblings; variant arrows switch between them. No operation
  silently deletes content. See `docs/conversation-model.md`.
- **Vendor-neutral adapter contract.** UI components only know the
  `ChatAdapter` interface (streamed events, cancellation, errors); the mock
  implementation is deterministic (hash-seeded) and supports a documented
  `/fail` prompt prefix to exercise error/retry states.
- **Capability registry.** Tool chips in the composer are enabled by what the
  selected demo model advertises — never by the presence of an API key.
- **Versioned persistence.** One localStorage key, schema version 1, debounced
  writes, quarantine + fresh seed on malformed data. Temporary conversations
  are filtered from every write and vanish on reload by design.

## Prototype limits (honest labels)

- Responses, sources, research progress, and connection tests are **simulated
  and labeled** in the interface.
- Attachments are validated and previewed locally; they are **not analyzed**.
- The API-key field in Settings → Providers is a disabled placeholder; no
  credentials are solicited, stored, logged, or transmitted.
- Shared links are explicitly unavailable; local Markdown/JSON export works.
- No backend, database, authentication, analytics, or outbound network calls.

## Keyboard reference

- `Enter` send · `Shift+Enter` newline (configurable to Ctrl/Cmd+Enter in
  Settings → Chat) · IME composition never sends
- `Ctrl/Cmd + K` search conversations · `Esc` closes dialogs/menus
- Arrow keys navigate menus, search results, and variant switchers

## Documentation

- `docs/reference-audit.md` — what was actually observed vs. designed
- `docs/design-tokens.md` — colors, geometry, density, motion
- `docs/conversation-model.md` — branching semantics and persistence schema
- `docs/roadmap.md` — provisional four-week sequence
- `docs/verification.md` — commands, browser checks, screenshots, limits
- `docs/feature-status.md` — working / simulated / deferred matrix
- `docs/progress.md` — living handover log

## License

New original code in this milestone is offered under the MIT license — see
`LICENSE`. Third-party dependencies retain their own licenses (React, Vite,
Tailwind CSS, zustand, react-markdown, remark-gfm, rehype-highlight,
highlight.js, lucide-react, Vitest, Testing Library). Universe is an
independent project and is not affiliated with OpenAI or Anthropic.
