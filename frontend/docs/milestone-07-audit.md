# Milestone 07 — QA audit reproduction and plan

Audit prompt: `Uni_Prompt_07_Frontend_QA_and_Improvements.md` (external review
dated 20 October 2026, snapshot `30032c42e`).
This branch: `feat/m07-dependable-coherent-premium` (stacked on the rename
branch `feat/uni-rename-providers-polish`, which resolves F11).

## Phase 1 — finding dispositions

Every finding was reproduced or source-confirmed on this branch before any
fix. Evidence markers: **BR** = reproduced in the browser against the
production build; **SRC** = confirmed by reading the current source.

| ID | Disposition | Evidence |
| --- | --- | --- |
| F01 duplicate artifacts on repeated plugin save | Confirmed | **BR**: saved a Work report twice through Documents → Save output to Library; `universe:library:v1` then held two artifacts with the same title, both with `task: null`. **SRC**: `documentsSaveAdapter` creates a new artifact whenever `task.report.artifactId` is unset and never links it back. |
| F02 wrong provenance ("user-authored") | Confirmed | **BR**: the same artifacts showed `prov: "user-authored"` although the report is a labeled demo simulation. **SRC**: `adapters.ts` hard-codes `provenance: 'user-authored'` for new Work saves. |
| F03 silent denial in employee thread | Confirmed | **BR**: workspace-enabled + thread-granted Documents, employee not allowed → "Create Canvas document" closed the menu with no toast, no receipt, no artifact. **SRC**: `runAction` and `attach` discard the `DispatchOutcome`; precheck failures also return before any receipt is recorded. |
| F04 memory notes not in requests | Confirmed | **SRC**: the send path (`store.ts` around line 699) builds `system` from agent instructions + selected context only; `memoryNotes` is never read, while `EmployeeView` promises "Memory notes … are included when relevant." |
| F05 revoking one thread aborts all runs of the plugin | Confirmed | **SRC**: `ActiveRun` stores no thread identity; `revokeAndCancelThreadRuns` filters only by `pluginId`. |
| F06 CSV adapter ignores AbortSignal before side effects | Confirmed | **SRC**: `dataAnalyzeAdapter(input)` does not even accept `context`; it awaits `readFileText` then writes a Library artifact with no signal check. |
| F07 employee details: aria-modal without modal behavior | Confirmed | **SRC**: hand-built `role="dialog" aria-modal="true"` with no focus trap, no Escape, no focus return; same pattern in `LibraryContextDialog`. |
| F08 export scope dishonest | Confirmed | **SRC**: `exportAllData` serializes conversations/preferences/providers; `DataSection` claims "everything stored in this browser." |
| F09 picker empty state + no plugins in Chat | Confirmed | **BR**: picker shows a disabled "No enabled plugins" item with no Manage action. **SRC**: `PluginThreadRef` supports only `work`/`agent`; ordinary Chat has no picker. |
| F10 fragmented activity presentation | Confirmed | **BR**: thread showed "Run activity · 1 step" and a separate "Activity · 1 step" card. **SRC**: `threadModel.ts` groups run events and manual events into separate entries. |
| F11 Universe naming inconsistency | Fixed on this branch's base | The rename branch removes Universe from title, shell, composer, seeds; storage keys intentionally retained. |
| F12 attachment capability not stated in UI | Confirmed | **SRC**: the live prompt tells the model "names only", but the composer shows no capability hint to the user before send. |
| F13 SSE reader defects | Confirmed | **SRC**: trailing unterminated buffer dropped; each `data:` line parsed independently (multiline data unsupported); provider `error` events ignored → partial reply can end `complete`. |

Additional observations confirmed in source: latest-assistant-node selection
across the whole tree (`Object.values(conversation.nodes)` sorted by
`createdAt`) instead of the active branch; generic `model-output` provenance
for employee saves; memory-note deletion leaves structured event labels; the
Library context dialog is a hand-built aria-modal; dispatch precheck failures
record no receipt despite comments claiming rejections are recorded.

## Phase 2–4 — implementation plan (one commit each, gated)

1. **Canonical save (F01, F02, branch-selection observation).** A shared
   `saveTaskReportToLibrary` operation used by the Outputs panel and the
   Documents plugin adapter: one artifact per report, linked back through
   `report.artifactId`, provenance preserved (`demo-simulation` /
   `provider-generated` + `generatedBy`), no-op saves skip writes, deleted
   artifacts get an explicit recreate path. Employee saves select from the
   active branch and preserve live/demo provenance.
2. **Plugin action outcomes (F03).** One result handler for every dispatch
   caller: success toast with Open action, denial with a precise reason and
   a recovery path (enable / allow for employee / grant for thread), errors
   and cancellations reported honestly. Precheck rejections record a
   bounded receipt so history stays truthful.
3. **Cancellation correctness (F05, F06).** `ActiveRun` carries the thread
   key and agent id; thread revocation aborts only matching runs; removing
   employee access cancels only that employee's runs; adapters check the
   signal after async reads and immediately before committing Library /
   context mutations; runs are staged before commit.
4. **Real employee memory (F04).** Enabled memory notes are resolved into
   the request context at explicit send time, scoped to that employee, with
   the exact included block previewable; wording matches behavior; deleting
   a note changes future requests without rewriting history.
5. **Accessible modals (F07).** Employee details and the Library context
   picker use the shared `Dialog` (focus trap, Escape, focus return,
   `aria-modal` that is real). Desktop-docked panels that are not modal stop
   declaring `aria-modal`.
6. **Honest export + workspace backup (F08).** The existing export is
   relabeled to its true scope; a separate versioned workspace backup
   includes tasks/agents/notes/library/context/plugins (never credentials
   or temporary chats) with validation, preview, and safe restore.
7. **Plugins in ordinary Chat (F09).** `PluginThreadRef` gains a `chat`
   kind; the Chat composer gets the same plugin bar; the picker's empty
   state links to Manage Plugins; temporary chats keep grants/receipts
   session-only and out of persistence.
8. **Attachment honesty + SSE hardening (F12, F13).** Composer states the
   metadata-only capability; the SSE reader buffers by event (CRLF-safe,
   multiline `data:` joined), flushes a terminated trailing event, surfaces
   provider `error` events as terminal errors, and never reports `complete`
   after an error.
9. **Activity + design pass (F10 + Phase 4 items).** One unified activity
   presentation; output actions next to the output; consistent states.

## Phase 5 — verification plan

Gates after every commit: `tsc --noEmit`, `eslint`, targeted `vitest`, full
suite before push. Browser journeys from the prompt (chat plugin round-trip,
double-save single record, scoped memory, cross-thread cancellation,
backup/restore, keyboard-only + reduced-motion). Screenshots in
`download/m7-verify/`.
