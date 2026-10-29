# Uni — Frontend

> Canonical repository: <https://github.com/AdilShamim8/Uni>

> 🌱 **New here?** The [repository root README](../README.md) is the
> beginner-friendly guide — 3-command quick start, step-by-step provider
> connection for OpenAI / Claude / OpenRouter / free tiers / local models,
> screenshots, and troubleshooting. This file is the developer reference.

An independent, open-source AI workspace with five destinations: **Chat**,
**Work**, **Agents**, **Plugins**, and a shared **Library** — all running
locally in your browser. Out of the box, chat responses come from a
deterministic mock adapter and Work execution is a clearly-labeled local
simulation — and you can **connect your own API key** (any supported
OpenAI-compatible or Anthropic endpoint) in Settings → Providers to chat
live, with no backend or account in between.

Work and Agents are message-first: describing a goal opens a task thread
you refine by messaging it, and selecting an employee opens its actual
conversation. Plugins are local tools with per-thread grants and an honest
receipt for every action.

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
    chat/          # sidebar, top bar, composer, messages, search, export
    conversation/  # shared thread model, ThreadView, ThreadComposer, cards
    work/          # goal composer, task threads, expanded brief, templates
    agents/        # directory, builder, employee conversation view
    plugins/       # catalogue, detail, thread plugin bar, receipts
    library/       # artifact collection, viewer, projects
    settings/      # appearance, chat prefs, data tools, provider profiles
    previews/      # research, images, voice, canvas, data, coming-soon
  domain/         # conversation tree, workspace types, task machine, plugin types
  services/
    connection/   # real provider connection testing + model discovery
    live/         # live streaming adapter (OpenAI-compat + Anthropic SSE)
    mock/         # deterministic chat adapter + all fixtures
    plugins/      # typed dispatcher + built-in local adapters
    storage/      # versioned localStorage slices + private credential store
  state/          # zustand stores: chat, agents, work, library, plugins, context, compare
  styles/         # design tokens + base styles
tests/            # interaction and unit tests
docs/             # audit, architecture, tokens, verification, status
```

Each destination has its own routed pages but shares one domain layer:
Work tasks reference agents by id, agent conversations live in the chat
store with an `agentId` scope, and Library artifacts link back to their
source task. See [`docs/architecture.md`](docs/architecture.md) for the
full map including the Work execution model and its safety guarantees.

Key decisions (full rationale in `docs/`):

- **Message tree, not a list.** Editing a user message or regenerating a
  response creates siblings; variant arrows switch between them. No operation
  silently deletes content. See `docs/conversation-model.md`.
- **Vendor-neutral adapter contract.** UI components only know the
  `ChatAdapter` interface (streamed events, cancellation, errors); the mock
  implementation is deterministic (hash-seeded) and supports a documented
  `/fail` prompt prefix to exercise error/retry states.
- **Capability registry.** Tool chips in the composer are enabled by what the
  selected model advertises — never by the presence of an API key.
- **Bring your own key.** Settings → Providers connects any endpoint with a
  real API key: connection test with latency, model discovery, live SSE
  streaming, and honest failure diagnostics. Keys are stored only in your
  browser (their own localStorage key, never in exports) and are sent only to
  the endpoint you configure. With no key connected, the deterministic demo
  adapter keeps everything fully offline.
- **One-tap onboarding for every provider.** 21 preset chips (OpenAI,
  Anthropic, OpenRouter, Google, Groq, DeepSeek, Mistral, xAI, Cerebras,
  Fireworks, Perplexity, SambaNova, NVIDIA NIM, Cohere, GitHub Models,
  HuggingFace Router, Together, DashScope, Zhipu, Ollama, LM Studio) prefill
  the endpoint, with a green FREE badge on providers that offer a no-cost
  tier. Suggested-model chips (`features/settings/suggestedModels.ts`) match
  the endpoint hostname and one-tap fill real model ids — editable afterwards,
  never overriding live discovery. Long discovered model lists collapse
  behind a `+N more models` toggle.
- **Honest OpenRouter verification.** OpenRouter's model catalog is public,
  so its connection test also proves the key against the auth-protected
  `/key` endpoint (a 401 there is reported as a failure, not "connected"),
  and discovery lists `:free` models first. Live chat requests to
  OpenRouter carry the optional `X-Title: Uni` attribution header.
- **Versioned persistence.** One localStorage key, schema version 1, debounced
  writes, quarantine + fresh seed on malformed data. Temporary conversations
  are filtered from every write and vanish on reload by design. Workspace
  slices (agents, work, library, plugins, context, compare) each persist
  under their own versioned key; pre-milestone data migrates with defaults
  and is never wiped.
- **One conversation surface, projected.** Work threads and employee
  threads render through the same typed entry model (`features/conversation`)
  from the stores that own the data — chat messages stay chat messages, work
  events stay task events, and old tasks project into readable transcripts
  without reruns or copies.
- **Plugins are a boundary, not a marketplace.** Built-in plugins enable
  code that already ships; the dispatcher validates the access intersection
  (workspace ∩ employee ∩ thread ∩ implemented capability) before anything
  runs, assigns run ids with AbortSignals, and records honest receipts —
  cancelled or revoked runs can never be presented as success. External
  entries (GitHub, Gmail, Drive) stay unconnected descriptions until a real
  integration exists.

## Prototype limits (honest labels)

- Without a connected key: responses, sources, and research progress are
  **simulated and labeled** in the interface.
- With a connected key: chat is live, but tool previews stay local, and
  multimodal content / tool-calling on the wire are not implemented.
- Attachments are validated and previewed locally; only their **names** are
  mentioned to a connected model — files are never uploaded.
- Live endpoints depend on the provider allowing direct browser (CORS)
  requests; failures surface honest diagnostics.

## Keyboard reference

- `Enter` send · `Shift+Enter` newline (configurable to Ctrl/Cmd+Enter in
  Settings → Chat) · IME composition never sends
- `Ctrl/Cmd + K` search conversations · `Esc` closes dialogs/menus
- Arrow keys navigate menus, search results, and variant switchers

## Documentation

- `docs/milestone-06-plan.md` — plugins/conversational-work implementation map
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
highlight.js, lucide-react, Vitest, Testing Library). Uni is an
independent project and is not affiliated with OpenAI or Anthropic.
