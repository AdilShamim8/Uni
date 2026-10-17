# Feature Status Matrix — Milestone 3

Precise distinction between what **works locally**, what is a **labeled
simulation**, what is **live through the user's own key**, what **requires
integration we do not ship**, and what is **planned**. "Working" means the
feature operates on local data with real behavior; "simulated" means the
workflow is demonstrated with fixtures and honest labeling; "live" means a
real request to a provider the user configured with their own API key.

## Destinations and navigation

| Feature | Status | Notes |
| --- | --- | --- |
| Chat, Work, Agents as primary destinations | Working | Route-based active state; one obvious treatment |
| Library as shared secondary destination | Working | One collection, reachable from nav and Work |
| Routes `/`, `/c/:id`, `/work(/:taskId)`, `/agents(/:agentId)`, `/library` | Working | Direct load, refresh, Back/Forward verified |
| Unknown-id recovery | Working | Bad task/agent ids redirect to their home after hydration |
| Route-specific history | Working | Recent tasks on Work routes; conversations elsewhere |
| Mobile drawer as a modal | Working | Focus trap, Escape, inert background, focus return |
| Collision-aware menus | Working | Auto-flip, max-height, preventScroll focus |

## Work

| Feature | Status | Notes |
| --- | --- | --- |
| Task list + filters (All/In progress/Needs input/Ready for review/Completed) | Working | Filters are view states, honest counts |
| Starter templates (Research brief, Data review, Email draft) | Working | Local briefs with example context, clearly labeled |
| Task brief (title, goal, deliverable, agent, project) | Working | Editable while draft; agent resolved by name in UI |
| Demo execution state machine | Working | `draft → queued → running → needs_input / ready_for_review → completed`, with paused/cancelled/failed; guarded transitions — no completion straight from cancelled/failed |
| Run ids + late-event rejection | Working | Cancelled runs cannot accept timer events |
| Pause / resume / cancel / retry / reopen | Working | Deliberate paths only |
| Reload interruption | Working | Running tasks demote to paused+interrupted with a Resume action; nothing pretends to have kept running |
| Input requests during a run | Working | Question + options; answers persist across reload and reach the report |
| Activity timeline | Working | Per-run events with kinds, timestamps, honest labels |
| Review flow: edit → download → complete | Working | Download always matches the edited visible report |
| Save report to Library | Working | Creates/updates one linked artifact, no duplicates |
| Work execution itself | Simulated (labeled) | Deterministic local script; no provider is contacted for Work runs |

## Agents

| Feature | Status | Notes |
| --- | --- | --- |
| Directory with search + categories | Working | Personal assistant + specialists |
| Builder (name, description, instructions, provider/model, tools, starters) | Working | Validates empty name/instructions, dead provider refs, unknown models |
| Duplicate / archive / delete | Working | Built-ins cannot be deleted; referenced profiles archive instead of orphaning tasks |
| Chat with agent | Working | One scoped, reused conversation per agent; instructions sent as the system prompt |
| Agent model preference | Working | Resolved explicitly and shown as the effective configuration |
| Personal assistant view (Conversation / Assigned work / Memory / Schedules) | Working | Tabs over the same underlying data, no duplicate histories |
| Memory notes | Working | Local add/edit/delete with scope + timestamps; user-authored only |
| Schedule drafts | Working (drafts only) | "Saved locally — execution unavailable" — no runtime, never shown as Active |
| Agent execution / notifications / background work | Requires integration | Not built; drafts record intent only |

## Library

| Feature | Status | Notes |
| --- | --- | --- |
| Shared artifact collection | Working | Kind filters, provenance labels, linked source tasks |
| Artifact viewer + editor | Working | Markdown render, edit, download |
| Rename / delete artifacts | Working | Confirmation on delete; task reports unaffected |
| Projects (local context groups) | Working | Lightweight folders with honest task/artifact counts |
| Cross-device sync | Planned | Local-only by design in this milestone |

## Chat (carried forward, preserved)

| Feature | Status | Notes |
| --- | --- | --- |
| BYOK live streaming | Live | OpenAI-compatible + Anthropic endpoints, user's own key, stored privately |
| Demo adapter | Simulated (labeled) | Default without a key; agent conversations surface instruction scoping |
| Composer draft ownership | Working | Submitted snapshot cleared at submit; drafts scoped per conversation and preserved during streaming |
| Timestamps, delete-with-undo, honest live/demo status | Working | Status derived from credentials, never hard-coded |
| Search (Ctrl+K), settings (Ctrl+,), themes, reduced transparency | Working | Unchanged from earlier milestones |

## Honesty rules maintained everywhere

- No "any provider" claims — supported providers and compatible endpoints only.
- No global "nothing leaves your browser" claim while a BYOK endpoint is live.
- Storage failures surface a warning; nothing reports "saved" on a failed write.
- Temporary chats are not saved locally, but a live request still reaches its provider.
- Credentials never appear in exports, events, notes, schedules, or fixtures.
