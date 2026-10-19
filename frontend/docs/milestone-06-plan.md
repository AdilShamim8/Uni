# Milestone 06 Plan — Plugins, conversational Work, persistent AI employees

Implementation map for the milestone defined in the milestone brief
(Plugins plus one consistent message-based experience for Chat, Work, and
AI employees). Branched from `main` at `121b38bfc`
(19 October 2026). Written before any code, per the brief's section 1.

## 0. Audit — what exists and what is reused

No `AGENTS.md` exists in the repository; the living equivalents are
`docs/progress.md`, `docs/architecture.md`, and `docs/conversation-model.md`,
which were read in full. Git remote points at `AdilShamim8/Uni` (renamed);
deployment hostname and storage keys stay untouched.

| Area | Current state (verified on `121b38bfc`) | Milestone decision |
| --- | --- | --- |
| Routes | `/`, `/c/:id`, `/work`, `/work/new`, `/work/:taskId`, `/agents`, `/agents/:agentId`, `/library` | Add `/plugins`; keep every existing route and its refresh/Back behavior |
| Chat | `ChatPage` + `MessageList` + `MessageItem` + `Composer`; message tree with variants, edit-into-branch, delete+undo; 45+ tests | **Preserve as-is.** Chat keeps its specialized branching surface; the new shared thread layer reuses its visual atoms (`Markdown`, status pills, composer styling) so all three surfaces stay visually consistent |
| Work | Form-first: `/work/new` big form; task page = Brief / Run / Report sections + activity side panel; state machine (`taskMachine`), demo runner, live BYOK AI-draft runner | **Convert to message-first.** `/work` gets a goal composer + recent work; `/work/:taskId` becomes a thread built by projecting existing task data. Brief/Activity/Outputs move to the existing inspector pattern / mobile sheet. The form route stays reachable as an "expanded brief" for precise setup |
| Agents | `PersonalAssistantView` shows an information card + Start/Continue conversation button that navigates to `/c/:id`; specialists get a profile page with a Chat button | **Open the conversation directly.** `/agents/:agentId` renders the employee thread in place; profile/memory/work/plugins/routines move to a compact inspector |
| Plugins | None — no plugins area, registry, or dispatcher exists (confirmed by route + feature inventory) | **New product section**: typed registry, store, catalogue/detail UI, dispatcher with grants, three built-in local adapters |
| ChatAdapter | Streamed text + history; mock + live SSE adapters. No tool-call events, no orchestration | **Unchanged.** Plugin actions are user-invoked through the dispatcher, not provider tool-calls; no fabricated automatic execution |
| Canvas / Library | Versioned artifacts (drafts/snapshots/restore), `openInspector({tab:'canvas', artifactId})` | Reused by the Documents plugin adapter (same engine, same records) |
| CSV analysis | Real local engine (`parseCsvText`, `profileColumns`, `groupAggregate`, `summarizeToMarkdown`) + upload flow | Reused by the Data analysis plugin adapter (same engine, not a fork) |
| Context | `contextStore` with per-chat/task selection and exact send preview | Reused by the Library context plugin adapter (explicit selection only) |
| Storage | Versioned slices: `universe:data` (chat), `universe:agents:v1`, `universe:work:v1`, `universe:library:v1`, `universe:context:v1`; credentials isolated in `universe:credentials:v1` | New `universe:plugins:v1` slice (enabled set, per-agent/thread grants, receipts). All existing keys, schemas, and migration behavior preserved; missing old fields default, never wipe |

Baseline gates on the branch point: typecheck pass, eslint 0 problems,
196/196 tests, production build clean.

## 1. Architecture — one shared conversation surface

New module `src/features/conversation/` used by **Work threads and employee
threads** (Chat keeps its tested surface; all three share the same design
tokens, `Markdown`, pills, and composer visual language):

```
features/conversation/
  threadModel.ts        typed ThreadEntry union + stable ids + dedup/order
  projectWorkThread.ts  WorkTask -> ThreadEntry[] (pure projection, no rerun)
  projectAgentThread.ts agent conversation + notes/tasks -> ThreadEntry[]
  useThreadScroll.ts    reader-friendly auto-scroll + jump-to-latest
  ThreadView.tsx        720–800px reading column, role="log", entry list
  ThreadEntryView.tsx   switch over entry kinds; message entries reuse the
                        chat message bubbles' markup and actions
  ThreadComposer.tsx    purpose-aware composer (work / employee), honest
                        status line, plugin picker chips, mode selector
  cards/TaskCard.tsx        compact canonical-task card (opens /work/:id)
  cards/ClarifyCard.tsx     options + free-text answer
  cards/ActivityCard.tsx    collapsible plan/activity with real statuses
  cards/PluginReceipt.tsx   action proposal/result with execution provenance
  cards/OutputCard.tsx      artifact preview -> Canvas, versions, download
```

Entry kinds (each with a stable `entryId` for dedup, e.g.
`work:ev:<eventId>`, `work:msg:<messageId>`, `plugin:<runId>`):
message (streaming/markdown/copy/stop where valid), task_card, clarify,
activity, plugin_proposal, plugin_result, output_card, status_note
(error / cancelled / needs-input / interrupted honesty).

**Sources of truth stay unchanged**: chat messages remain chat-store
messages; work events remain task events; new human/assistant messages on a
work thread live on the task itself (`messages`, persisted); plugin runs
live in the plugins store as typed receipts referenced by run id. The thread
view combines them with explicit selectors and never copies events between
stores.

## 2. Work — genuinely conversational

- `/work`: task-oriented composer ("Describe an outcome…") + templates +
  recent/active work. Typing a goal + send creates a task and opens its
  thread — no forced form. "Expanded brief" opens the existing form route.
- `/work/:taskId`: opens the thread immediately. Header keeps goal, agent,
  mode concise. Brief / Activity / Outputs live in the inspector (desktop)
  or detail sheet (mobile) — reusing the run controls, report editing, and
  download that already exist.
- Thread sequence: original task message → grounded acknowledgment →
  inline status card (stop/cancel/retry tied to the right run) → streamed
  output as an assistant response with a linked artifact card → follow-ups.
- **Follow-ups are real**: stored as task messages with stable ids. In
  AI-draft mode a follow-up send (or explicit "Revise") triggers a new live
  request whose prompt includes the goal, agent instructions, selected
  context, prior turns within an explicit token-ish budget, and the previous
  output (truncated). Prior reports are preserved (`previousReports`, bounded)
  and rendered as collapsed prior outputs. Demo mode reruns honestly note
  that the script is fixed and include the guidance in the fixture report.
- Ready-for-review before Completed is preserved (existing workflow).
- Reload/interruption honesty, stop-preserves-partial, late-event rejection:
  all inherited from the existing runner invariants; new tests cover them.
- **Backward compatibility**: projection renders old tasks (goal, events,
  report) as a readable transcript without rerunning, duplicating artifacts,
  or rewriting history. `messages` defaults to `[]`, `previousReports` to
  `[]` on load — missing fields never wipe existing data.

## 3. Agents — employees you message directly

- `/agents/:agentId` renders the employee conversation **in place** (same
  agentId-scoped chat-store conversation via `openAgentConversation`; no
  navigation hop, no information card first). Profile editing, directory
  browsing, and builder stay secondary actions.
- Header: avatar/initials, name, role, honest availability derived from real
  state — *responding* (assistant message streaming), *working on <task>*
  (only when a real assigned run is active, labeled demo/live), *waiting for
  input* (task `needs_input`), otherwise *available in this app*. No fake
  "Online 24/7", no invented connected computer.
- Inspector (desktop side panel / mobile sheet): Profile (editable), Memory
  (notes with edit/delete + explicit "included in future requests" wording),
  Assigned work (canonical task cards), Plugins (per-employee allow list),
  Routines (existing schedule drafts, "Saved locally — execution
  unavailable").
- Employee composer supports explicit commands (also offered as action
  buttons): `/assign` (inline brief → one real local Work task + assignment
  card in thread), `/remember` (user-confirmed local memory note + receipt),
  `/task` (list/open assigned work), `/plugin` (propose an available plugin
  action), `/routine` (open schedule draft UI). Free text is just chat —
  **no silent intent execution**; model suggestions never render as executed
  actions.
- Seeded editable **Uni Assistant** (fresh installs; existing stored
  profiles keep their names — a rename is not a reason to lose data) plus
  the existing clearly-labeled specialist examples. No private data seeding.

## 4. Plugins — a real product section

- `/plugins` route + calm nav entry (sidebar destination list; mobile via
  the drawer — the bottom bar keeps its four primary destinations).
- Typed registry (`domain/pluginTypes.ts`): id, name, version, description,
  category (Documents / Data / Productivity / Development / Custom),
  capabilities, requested scopes, execution type (`local-built-in` |
  `integration-required`), configuration requirements. Catalog metadata is
  separate from enabled state, grants, and connection state.
- Availability states: Available built-in · Enabled locally · Integration
  required · Connected (only when actually connected — never claimed here) ·
  Error/unavailable. Enabling a bundled plugin **enables local code that
  already ships** — Enable/Disable, no fictitious install flow. External
  entries (GitHub, Gmail, Drive…) render as honest "Integration required"
  details; no OAuth theater.
- Store (`state/pluginsStore.ts`, `universe:plugins:v1`): enabled set,
  per-agent allow lists, per-thread grants, typed receipts (run records with
  status/result/provenance). No tokens, keys, or secrets — ever.
- Dispatcher (`services/plugins/dispatcher.ts`): validates capability +
  access intersection (workspace enabled ∩ agent allowed ∩ thread grant ∩
  implemented) **before** execution, assigns request/run ids, takes an
  `AbortSignal`, rejects late results after revoke/cancel, and records an
  honest receipt (failed/revoked is never success). Adapters are typed;
  external/MCP stays a documented boundary — no remote code execution.
- Built-in adapters (reuse existing engines, no forks):
  1. **Documents** — create/open a persistent Canvas document via the
     library store + inspector; save thread output to Library as a versioned
     artifact.
  2. **Data analysis** — open the user-selected CSV, run the existing real
     local analysis (`parseCsvText` → profile/summary), emit a typed result
     entry + artifact. File inputs stay user-selected; metadata-only
     attachments are never claimed as analyzed.
  3. **Library context** — find local documents and attach explicitly
     selected content within the current thread's scope (context store).
- Composer Plugins picker (chips, returns to the same draft), plugin
  management surfaced from agent settings and the employee inspector.
  Enabling shows a concise access preview; revoking kills new calls and
  rejects in-flight results with an honest receipt.

## 5. Branding

New visible copy in the surfaces this milestone touches says **Uni**.
Historical names, storage keys (`universe:*`), route ids, asset paths, and
the existing deployment hostname are untouched — local conversations,
credentials, agents, tasks, and artifacts survive the repository rename.

## 6. Delivery order (each stage committed and pushed individually)

1. This plan document.
2. Conversation domain: thread model + projections (pure functions, tests).
3. Shared thread UI: ThreadView, ThreadComposer, entry cards.
4. Work message-first (home composer, task thread, follow-ups/revision,
   backward-compatible transcript, store extensions + migrations).
5. Employee experience (direct conversation, inspector, commands,
   availability honesty).
6. Plugins registry + store + catalogue/detail + navigation.
7. Dispatcher + grants + composer picker + agent-settings integration.
8. Three built-in adapters + receipt entries in threads.
9. Visual polish across destinations; 390/768/1440 + both themes.
10. Regression suite for the journeys and invariants in the brief.
11. Docs: README (canonical `AdilShamim8/Uni` links, architecture, plugin
    contracts, capability backlog, verification notes).
12. Browser QA with synthetic data; screenshots; fixes.
13. Push branch, open draft PR.

## 7. Acceptance checks

- Journeys from brief section 9, executed against controlled adapters and
  the real local demo runner (no real keys, no paid traffic):
  Work goal→run→output→revision→version; employee open→memory→assign→open
  task→back; plugins enable→grant→real document→Canvas; CSV→computed output
  receipt; revoke→truthful unavailable; reload→transcript recovered without
  rerun or duplication.
- `npm run lint` (0 problems), `npm run typecheck`, `npm test`, production
  build — green after every commit.
- No horizontal overflow at ~390/768/1440; keyboard + Escape + focus-visible
  pass; reduced motion/transparency respected; zero console errors.
- Exports contain no credentials, no plugin grants, no memory notes the user
  did not create.
