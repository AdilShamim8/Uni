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
| Save report to Library | Working | Creates/updates one linked artifact, no duplicates; AI drafts save with provider-generated provenance and model snapshot |
| Work execution (demo mode) | Simulated (labeled) | Deterministic local script; no provider is contacted for demo runs |
| Work AI-draft execution | Live (BYOK) | One bounded drafting request via the BYOK ChatAdapter — connected model only, explicit Generate, run-scoped events, stop/failure preserve partial content, per-task controller isolation, provider-generated provenance (milestone 05) |

## Agents

| Feature | Status | Notes |
| --- | --- | --- |
| Directory with search + categories | Working | Featured Uni hero + personal assistant + specialists |
| Builder (name, description, instructions, provider/model, tools, starters) | Working | Validates empty name/instructions, dead provider refs, unknown models |
| Duplicate / archive / delete | Working | Built-ins cannot be deleted; referenced profiles archive instead of orphaning tasks |
| Chat with agent | Working | One scoped, reused conversation per agent; instructions sent as the system prompt |
| Uni teammate | Working | Seeded builtin headline teammate (renamed from the interim "Grok Bot"); featured hero renders the live profile (name, description, starters) with starter-prefilled threads; one-time migrations add it to existing installs and rename legacy profiles while respecting user edits; honest labeling — runs on the user's connected provider (xAI · Grok preset leads the list) or the local demo |
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
| One-tap provider presets | Working | OpenAI · GPT, xAI · Grok, Anthropic · Claude, Google AI Studio · Gemini, DeepSeek, Groq, OpenRouter, Together, Mistral, Ollama, LM Studio — label + kind + endpoint filled in one tap |
| Demo adapter | Simulated (labeled) | Default without a key; agent conversations surface instruction scoping |
| Composer draft ownership | Working | Submitted snapshot cleared at submit; drafts scoped per conversation and preserved during streaming |
| Timestamps, delete-with-undo, honest live/demo status | Working | Status derived from credentials, never hard-coded |
| Plugins in ordinary Chat | Working | Conversation-scoped grants + receipt strip; employee conversations keep agent rules; chat grants session-only; temporary receipts never persist (m07) |
| Canonical Work save | Working | ONE artifact per report shared by Outputs panel and plugin; provenance preserved; deleted links recreate (m07) |
| Workspace backup/restore | Working | Versioned, validated, previewed, snapshotted; excludes credentials and temporary chats (m07) |
| Search (Ctrl+K), settings (Ctrl+,), themes, reduced transparency | Working | Unchanged from earlier milestones |

## Honesty rules maintained everywhere

- No "any provider" claims — supported providers and compatible endpoints only.
- No global "nothing leaves your browser" claim while a BYOK endpoint is live.
- Storage failures surface a warning; nothing reports "saved" on a failed write.
- Temporary chats are not saved locally, but a live request still reaches its provider.
- Credentials never appear in exports, events, notes, schedules, or fixtures.

---

# Milestone 4 additions — Dynamic workspace & premium features

## Shell and composition

| Feature | Status | Notes |
| --- | --- | --- |
| Simplified sidebar (project selector, one nav card, context-aware New, one Tools menu) | Working | No per-item cards/dots; Library is a fourth destination |
| Mobile bottom destination bar | Working | Four real destinations; drawer keeps history/tools |
| Honest activity indicator | Working | Real count of running/paused/needs-input tasks; hidden when none |
| Focus mode | Working | Collapses sidebar + panels; Esc exits; no state cleared |
| Balanced empty chat | Working | Composer directly below greeting in one composition; real recents only when data exists |
| Resizable inspector panel | Working | Pointer + keyboard (arrows/Home/End/Enter), 360–560px, remembered in `universe:layout:v1`; full-height sheet below 1280px |
| Inspector tabs (Canvas / Context) | Working | One panel surface across all destinations |

## Feature A — Workspace command palette

| Feature | Status | Notes |
| --- | --- | --- |
| Ctrl/Cmd+K global search | Working | Platform-aware shortcut labels |
| Scopes: All / Chats / Tasks / Agents / Projects / Files | Working | Real local titles and content |
| Quick actions (new chat/task/document, settings, theme) | Working | Keyboard navigable, grouped |
| Temporary-chat exclusion; no credentials indexed | Working | Tested |
| Chats-only flow preserved | Working | Scope selector defaults to All; Chats one click away |

## Feature B — Persistent Canvas and artifact versions

| Feature | Status | Notes |
| --- | --- | --- |
| Library-backed Canvas panel (edit/preview/rename/copy/download) | Working | Downloads always match the screen, including unsaved edits |
| Debounced working-draft autosave with truthful save states | Working | Draft separate from versions; storage failures shown honestly |
| Bounded version history (20) + named snapshots | Working | No version per keystroke |
| Version diff + Restore as a new version | Working | Restoration never erases history |
| Save-from-message with source conversation/message ids | Working | Always a new document — never a silent overwrite |
| Canvas tool creates a document | Working | Composer tool seeds a versioned document and opens the panel |
| Code artifacts are plain text | Working | No execution, no untrusted HTML |
| Migration from pre-version artifacts | Working | Tested from a real old fixture |

## Feature C — Real project context

| Feature | Status | Notes |
| --- | --- | --- |
| Context inspector (add/remove, availability, size) | Working | Per chat/task; deleted records show "was deleted", not orphan ids |
| "Included on your next live send" preview | Working | Exact block shown before anything leaves the device |
| Context sent only on explicit sends | Working | Prepended to the system prompt at send time only |
| Explicit size limits | Working | 16 KB/item, 48 KB total, truncation labeled |
| Project detail view (tasks, documents, agents, context-using chats) | Working | `/library?project=<id>` |
| Cross-store cleanup on project/artifact delete | Working | Task/agent references cleared; context pruned |
| Context persisted independently of credentials | Working | `universe:context:v1`; never in exports |

## Feature D — Analysis of uploaded CSV files

| Feature | Status | Notes |
| --- | --- | --- |
| Real local parsing (quoted delimiters/newlines, ragged rows, duplicate headers) | Working | papaparse; warnings shown, never substituted results |
| File/row limits | Working | 2 MB, 20k rows, 200 cols — truncation labeled |
| Input preview + column type control | Working | Auto inference with ambiguity notes; explicit overrides |
| Numeric summaries (min/max/mean/median/σ/missing) | Working | Hand-checked tests; blanks, negatives, zeros, malformed handled |
| Grouping + chart with data-table alternative | Working | sum/mean/count/min/max; labeled SVG + table |
| Downloads (data CSV + summary MD) | Working | Formula-sanitized exports (`=+-@` neutralized) |
| Derived artifact with local-computation provenance | Working | Source file never persisted; retention stated in UI |
| Sample retained as labeled example | Working | Same computation path as uploads |

## Feature E — Side-by-side model comparison

| Feature | Status | Notes |
| --- | --- | --- |
| Compare action in Chat | Working | Explicit Run only — never auto-runs |
| Up to two models, one prompt, context inspection | Working | Context summary with size; included only on live runs |
| Demo without a key | Working | Two clearly labeled fixture responses |
| Live through BYOK | Working | Up-to-two-requests charge warning; reuses the live adapter per slot |
| Per-slot controllers, run ids, result slots | Working | Stop/failure of one side never affects the other; not routed through the active-chat controller |
| Copy / Continue in chat / Save to Canvas | Working | Provenance preserved ("Continued from a comparison") |
| Neutral presentation | Working | Measured durations only; no invented scores, costs, or latencies |
| Credential-free history | Working | `universe:compare:v1` stores no keys (tested) |


# Milestone 06 — Plugins, conversational Work, AI employees

## Shared conversation surface

| Feature | Status | Notes |
| --- | --- | --- |
| Typed thread model with dedup/ordering | Working | `features/conversation/threadModel.ts` — stable entry ids; pure projections, tested |
| Work → thread projection (backward compatible) | Working | Old tasks render goal/events/report as a transcript without reruns or duplication; missing fields default |
| Employee → thread projection | Working | Real agent conversation + structured events (assignments, memory, routines) |
| Shared ThreadView + ThreadComposer | Working | 720–800px reading column, auto-scroll, jump-to-latest, per-thread drafts (`universe:thread-drafts`, kept out of exports) |
| Entry cards: activity / task / clarify / output / plugin receipt / status note | Working | Honest tones, live statuses, canonical links only |

## Work — message-first

| Feature | Status | Notes |
| --- | --- | --- |
| Goal composer on /work | Working | Demo auto-runs; AI draft waits for explicit Generate; deliverable inferred and editable |
| Task thread as the task page | Working | Brief/Activity/Outputs in one responsive inspector (sheet on mobile) |
| Follow-ups drive real runs | Working | Stored as task messages; demo reruns include guidance; AI drafts issue a revision request |
| Revision context + budgets | Working | Goal + agent instructions + selected context + bounded thread (6000 chars) + previous draft (6000 chars); "included" preview in the inspector |
| Prior outputs preserved | Working | Archived on revision (max 5) with download links |
| Expanded brief | Working | `/work/new` — precise setup; edits existing draft tasks (`?edit=`) |

## Employees

| Feature | Status | Notes |
| --- | --- | --- |
| Direct conversation on /agents/:agentId | Working | No info-card hop; same canonical chat thread, full message actions |
| Honest availability | Working | Responding / working on a task / waiting for input / available in this app — derived from real state only |
| Inspector: Profile / Memory / Work / Plugins / Routines | Working | Editable profile, notes with explicit inclusion wording, canonical tasks, per-employee allow list, schedule drafts ("Saved locally — execution unavailable") |
| /assign, /remember, /task, /routine, /plugin commands | Working | Explicit commands only; free text is chat — nothing executes silently |
| Assignment cards link the canonical task | Working | One real Work task, no copies, history intact both ways |
| Seeded Uni Assistant | Working | Fresh installs seed "Uni Assistant"; existing stored profiles keep their names |

## Plugins

| Feature | Status | Notes |
| --- | --- | --- |
| Catalogue + detail (Discover/Enabled, search, categories) | Working | Honest states: available built-in / enabled locally / integration required; external entries can never show Connected |
| Enable/Disable | Working | No install fiction; disable cancels in-flight runs and rejects late results |
| Typed dispatcher with access intersection | Working | workspace enabled ∩ employee allowed ∩ thread granted ∩ implemented — enforced before execution |
| Run ids, AbortSignal, receipts | Working | Bounded history (100); cancelled/revoked receipts never upgrade to success (tested) |
| Composer plugin picker + chips | Working | Per-thread grants, revoke with cancellation, actions return to the same draft |
| Documents adapter (create/save) | Working | Reuses Library + Canvas records; task-linked artifacts update in place |
| Data analysis adapter | Working | The real CSV engine on a user-selected file; honest no-file error; local-computation provenance |
| Library context adapter | Working | Explicit selection into the existing context store, within its limits |
| External plugins (GitHub, Gmail, Drive) | Integration required | Descriptions only — no OAuth, no tokens, no connection claims |
| Plugin storage | Working | `universe:plugins:v1` — no tokens, keys, or message text (tested) |

---

# Milestone 08 — long-conversation performance

## Transcript rendering

| Feature | Status | Notes |
| --- | --- | --- |
| Memoized transcript updates | Working | One node patched per streamed token; every other message bails at the memo boundary with zero reconciliation work (`variantPositions` + primitive props + `React.memo`) |
| Windowed transcript rendering (Chat + Work/employee threads) | Working | Tail window (120) mounts first; upward scroll materializes history block-by-block (40) with measured scroll compensation; rendered cap (320) collapses blocks that pass above the viewport; `overflow-anchor: none` keeps compensation single |
| Fail-open in non-measuring environments | Working | jsdom and hidden containers render the full transcript; transcripts ≤ 80 items never window |
| Bounded mount cost | Working | 600-message conversation: 1691 → 524 ms mount, longest block 1356 → 321 ms, DOM 19,506 → 4,025 nodes, heap 74 → 11 MB (see `verification.md`) |
| 60 fps streaming in long transcripts | Working | 0 long tasks / 16.7 ms median frame during a streamed reply (was 69 long tasks / 83.3 ms ≈ 12 fps) |
| Off-screen history accessibility | Honest limit | Not in the accessibility tree while windowed (virtualized-transcript tradeoff); reachable by scrolling, and never removed while the reader is near the bottom of what is rendered |
