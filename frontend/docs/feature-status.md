# Feature Status Matrix — Milestone 1

Precise distinction between **working local UI**, **labeled simulation**, and
**deferred integration**. "Working" means the feature operates on local data
with real behavior; "simulated" means the workflow is demonstrated with
fixtures and clear labeling; "deferred" means consciously not built here.

## Shell and navigation

| Feature | Status | Notes |
| --- | --- | --- |
| Collapsible sidebar (264px / 64px rail) | Working | State persisted |
| Mobile drawer navigation | Working | Scrim + tap-outside close |
| New chat / new temporary chat | Working | Empty chats pruned on navigation |
| Recent conversations grouped by date | Working | Pinned / Today / Yesterday / 7d / 30d / Older |
| Archived view | Working | Toggle in sidebar footer of history |
| Projects / Work / Email entries | Working (explanatory previews) | Subdued, open honest "later milestone" dialogs |
| Provider/model picker in top bar | Working | Selection persisted; live providers marked with status dot + Live hint |
| Temporary-chat indicator + toggle | Working | In-memory only |
| Shared links | Unavailable (labeled) | Top-bar menu states it and points to Markdown export |

## Conversations

| Feature | Status | Notes |
| --- | --- | --- |
| Deterministic simulated streaming | Simulated (labeled) | Default when no key is connected; hash-seeded responses |
| Live provider streaming (BYOK) | Working | Real SSE from any OpenAI-compatible or Anthropic endpoint the user connects |
| Stop generation | Working | AbortSignal honored; stopped state shown |
| Retry after error | Working | `/fail` prefix triggers a simulated failure |
| Regenerate → variants | Working | Sibling creation, `1/2` switcher |
| Edit earlier message → branch | Working | Original subtree preserved; auto-resend |
| Markdown, tables, code + copy | Working | GFM; raw HTML disabled; safe links |
| Simulated sources/citations | Simulated (labeled) | Reserved example domains, collapsible |
| Message feedback | Working | Local only |
| Local export (Markdown per chat, JSON all) | Working | Via item menu, top bar, Settings → Data |
| Search over titles + content | Working | Highlighted snippets, keyboard selection |
| Rename / pin / archive / delete | Working | Confirmations + undo toast for delete |
| Auto-scroll + jump to latest | Working | Follows only near the bottom |

## Composer

| Feature | Status | Notes |
| --- | --- | --- |
| Multiline auto-growing input | Working | Enter/Shift+Enter, Ctrl/Cmd+Enter mode, IME guard |
| Attachments (picker + drag/drop) | Working | Type/size/count validation, previews, removal, errors |
| Attachment analysis | Deferred (labeled) | Explicitly "kept local, not analyzed" |
| Tool picker (Search, Research, Images, Voice, Canvas) | Working + Simulated | Availability from capability registry; preview tools open labeled previews |
| Demo indicator | Working | Top-bar badge + composer footnote |

## Settings

| Feature | Status | Notes |
| --- | --- | --- |
| Theme (light/dark/system) | Working | Pre-hydration boot; OS sync |
| Density / text size | Working | Applied to document root |
| Reduced transparency | Working | Toggle + live OS `prefers-reduced-transparency` tracking |
| Send-key behavior | Working | Persisted |
| Personalization fields | Working (local) | Travel in the system prompt for both demo and live turns |
| Export all data / clear history / reset demo | Working | Confirmations for destructive actions |
| Provider profile CRUD + models | Working | Any OpenAI-compatible or Anthropic endpoint; suggested base URLs per type |
| API key entry + connect (BYOK) | Working | Masked input, reveal toggle, Enter-to-connect; stored only in this browser |
| Connection test | Working (real) | Live endpoint check with latency, model discovery, honest 401/403/404/429/CORS diagnostics |
| Disconnect / key hygiene | Working | Bad keys are never persisted; export never contains credentials |
| Privacy & about | Working | Local persistence, independence, attributions |

## Advanced previews

| Preview | Status | Notes |
| --- | --- | --- |
| Research | Simulated (labeled) | Brief → labeled progress → fixture report + example sources; copy/download |
| Images | Simulated (labeled) | Original bundled SVG samples; no generation requests |
| Voice | Simulated (labeled) | Call states + sample transcript; no microphone access |
| Canvas | Working (session-only) | Editable document/code fixture; no execution |
| Data analysis | Simulated (labeled) | Bundled sample CSV + precomputed chart |
| Assistant presets | Working (local) | Instructions stored in preferences |
| Tasks / connections / coding workspace | Deferred (explanatory) | Honest roadmap dialogs |

## Explicitly not in this milestone

Backend, database, real authentication, provider SDK calls through a server,
paid calls, analytics, external integrations, Work and Email products, code
execution. (BYOK requests go browser → user's endpoint directly, with no
Universe server in between.)
