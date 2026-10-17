# Architecture & Handover — Milestone 3

A concise map of the workspace added in Milestone 3 for anyone continuing
the project. Chat-era architecture is unchanged; see `progress.md` history.

## Destinations and routes

| Route | Component | Notes |
| --- | --- | --- |
| `/`, `/c/:conversationId` | `features/chat/ChatPage` | Preserved from milestone 1 |
| `/work` | `features/work/WorkPage` → `WorkHome` | Filters + templates + list |
| `/work/new` | handled by `/work/:taskId` (`taskId === 'new'`) | Brief form; `?template=` and `?agent=` prefills |
| `/work/:taskId` | `TaskWorkspace` | Brief / run / outputs + activity panel; mobile tabs |
| `/agents` | `AgentDirectory` | Search + categories |
| `/agents/:agentId` | `AgentDetail` → `PersonalAssistantView` or profile | `new` renders the builder; personal agents get the assistant view |

Unknown ids wait for store hydration, then redirect to the section home —
never a dead end, and never a premature redirect during boot.

## State slices

| Store | Key | Contents |
| --- | --- | --- |
| `state/store.ts` (chat, unchanged shape) | `universe:data` (v1) | conversations, preferences, providers |
| `state/agentsStore.ts` | `universe:agents:v1` | AgentProfile, MemoryNote, ScheduleDraft |
| `state/workStore.ts` | `universe:work:v1` | WorkTask + TaskEvent logs |
| `state/libraryStore.ts` | `universe:library:v1` | Artifact, Project |

Each slice loads/saves independently with version guards and quarantine
backups (`services/storage/workspaceStorage.ts`). Credentials stay in their
own private key and never join any of these payloads. Failed writes warn
once through the toast system instead of pretending to be saved.

## Work execution model

- `domain/taskMachine.ts` defines legal transitions; `completed` is only
  reachable from `ready_for_review`.
- The runner in `workStore.ts` is a module-scoped async loop over a
  per-deliverable plan. Every run gets a `runId`; `appendEvent` /
  `setCursor` / `parkForInput` / `resumeAfterInput` / `finishRun` all
  verify `currentRunId` and status before mutating — stale or cancelled
  runs cannot write.
- Pause/cancel abort the run's `AbortController`; timers never persist.
  On `initialize()`, running/queued tasks become `paused` +
  `interrupted: true` with an explanatory event.
- Input answers are persisted on the task (`runAnswers`) so a post-reload
  resume still produces a report that includes them.
- Reports are fixture content, honestly labeled; edits are local and the
  download always serializes the current markdown.

## Agents and chat wiring

- `Conversation.agentId` scopes a conversation to an agent.
  `openAgentConversation(agentId)` finds-or-creates exactly one ongoing
  thread per agent.
- `ChatRequest.system` carries the agent instructions. The mock adapter
  surfaces them in the reply ("Working from your agent instructions…");
  the live adapter includes them in the system prompt for both protocols.
- Agent provider/model preferences resolve explicitly in
  `resolveAdapter(preference)` with a usable-provider check (demo or
  connected credential), and the effective configuration is displayed in
  the assistant view.

## Where to extend next

1. **Real execution backend:** replace the demo runner with an adapter
   contract mirroring `ChatAdapter` (stream events into `appendEvent`
   with the same runId guards).
2. **Schedules runtime:** `ScheduleDraft` already models cadence,
   timezone, condition, and enable-intent; activation needs a worker and
   honest status pills.
3. **Artifact previews:** versioned artifacts, richer viewers; keep the
   provenance field mandatory.
