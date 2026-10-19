# Capability backlog — what is local, live, simulated, or missing

Honest inventory after Milestone 04. Every row was checked against the actual
implementation (source references included), not against marketing intent.
No decorative "premium" buttons imply completion anywhere in the UI, and no
paywall gates anything — unavailable capabilities say so plainly where they
are relevant.

## What works right now

| Area | Status | Evidence |
| --- | --- | --- |
| Local chat with simulated replies | **Local / simulated** | `mockChatAdapter.ts`, labeled "Demo" in the header and composer |
| Live chat with your own API key (BYOK) | **Live** | `liveChatAdapter.ts` (SSE, OpenAI-compat + Anthropic), `credentials.ts` — keys stay in this browser, never exported |
| Workspace search (chats, tasks, agents, projects, files) | **Local** | `CommandPalette.tsx` over the real stores |
| Persistent documents with version history | **Local** | `libraryStore.ts` (drafts, snapshots, bounded versions, restore) |
| Project context selection and inclusion | **Local** | `contextStore.ts` + `contextResolution.ts`; sent only on explicit live sends |
| CSV/TSV analysis of uploads | **Local** | `csvAnalysis.ts` — real parsing and computation, files never uploaded |
| Two-model comparison | **Local demo / live with a key** | `compareStore.ts`, explicit Run only, per-slot controllers |
| Work task runs (demo) | **Simulated** | deterministic runner in `workStore.ts`, "Demo" pill in the header |
| Work AI drafts (live) | **Live (BYOK)** | `workStore.ts` AI-draft runner on `liveChatAdapter.ts` — one bounded text-drafting request per explicit Generate; charge warning, context disclosure, provider-generated provenance |
| Export (conversations, documents, analysis) | **Local** | `exportUtils.ts`, `csvAnalysis.ts` — downloads match what is on screen |
| Conversational Work threads | **Local** | `features/conversation/` + `workStore.ts` follow-ups/revision — projected transcript, real reruns/requests, archived prior outputs |
| Persistent AI employees | **Local** | `EmployeeView.tsx` — direct conversation, memory notes, assignments, honest availability |
| Plugins (built-in local tools) | **Local** | `pluginsStore.ts` + `dispatcher.ts` + `adapters.ts` — typed manifests, per-agent/thread grants, receipts, three real adapters reusing Canvas/CSV/context engines |
| Plugin actions from threads | **Local (user-invoked)** | `ThreadPluginBar.tsx` — explicit actions only; no provider tool-calls are claimed |

## Missing integrations — and what completing them would take

| Capability | Current constraint | What completion would require |
| --- | --- | --- |
| Autonomous Work execution | Work now offers demo runs and bounded live AI drafts (`workStore.ts`); there is still no multi-step agent runtime — a draft is one request, no tools run, no external effects beyond that request | Real orchestration/tool runtime and execution events: a server-side (or local) agent runtime with sandboxed tool execution, step-level event streaming, retry/rollback semantics, and audit logs |
| Web research with verified citations | Existing research preview uses examples — `ResearchPreview.tsx` renders fixture sources explicitly labeled "simulated"; no live retrieval happens | Search/retrieval service, source attribution, and real results: a search API or retrieval pipeline, citation extraction with original URLs, freshness checks, and per-claim source linking |
| Image generation | Existing images are samples — `ImagesPreview.tsx` shows bundled SVG artwork created for this project | Supported image-generation API and output handling: a generation provider integration, content-policy handling, storage for generated assets, and provenance labeling |
| Real voice conversation | Existing voice view is a sample — `VoicePreview.tsx` requests no microphone and plays nothing | Audio permissions, capture/playback, supported speech/realtime integration: WebAudio capture, a speech-to-text + text-to-speech (or realtime websocket) provider, and honest handling of unsupported browsers |
| Active schedules and notifications | Existing schedules save drafts only — `ScheduleDraft.enabledIntent` records the user's intent; nothing ever fires | Reliable worker, scheduling state, delivery, and failure handling: a background scheduler (service worker or server), persistent schedule state with conflict resolution, notification delivery, and failure/backoff reporting |
| Email/connectors, cloud sync, sharing | No actual connected services/sync — the account menu says "Local — no account" and every store persists to this browser only | Appropriate authentication, storage, access control, and integration: an identity layer, server-side storage with E2E encryption decisions, sharing ACLs, and per-connector OAuth flows |

## Non-goals (explicit)

- Frontend-only work cannot deliver a secure remote execution platform; the
  "autonomous execution" row stays honestly labeled until a real runtime
  exists.
- No silent fallbacks: a failed live action is never replaced by a simulated
  success, in chat or in comparison.
- No upgrade paywall or fake "coming soon" upsell buttons. Where a capability
  is missing, the UI either omits it or explains the constraint in one line.

## Adapter boundaries kept ready

- `ChatAdapter` (`domain/chatAdapter.ts`) already isolates providers; live and
  mock implementations are interchangeable per turn and per comparison slot.
- `resolveAdapter`/`resolveSlotAdapter` are the single points where a provider
  is chosen — adding a research/image/speech provider later means adding an
  adapter, not rewriting components.
- Workspace slices (`agents`, `work`, `library`, `context`, `compare`,
  `layout`) load and quarantine independently; a new backend sync can adopt
  them one slice at a time.


## Plugin boundary (milestone 06)

The dispatcher (`services/plugins/dispatcher.ts`) is a typed, local-only
execution boundary. What it deliberately does **not** do:

- No remote code execution, dynamic plugin loading, or marketplace installs
  — enabling a built-in enables code that already ships with the app.
- No OAuth, token vault, or credential storage beyond the existing BYOK
  chat credential (which plugins never touch).
- No provider-driven tool calling — the ChatAdapter streams text; plugin
  actions are explicit user invocations validated against the capability
  registry.

A future external/MCP integration would register additional typed adapters
behind the same `registerAdapter` boundary, with consent screens, scoped
grants, and connection state that can only be set by a real handshake —
the store and catalogue already model those states without faking them.
