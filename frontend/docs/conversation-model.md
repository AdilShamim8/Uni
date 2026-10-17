# Conversation Model — Branching, Variants, Persistence

Date: 17 October 2026 · This document defines the branch behavior **before** implementation so editing never silently destroys content.

## Message tree

A conversation stores messages as a tree, not a flat list:

```ts
interface MessageNode {
  id: string;
  parentId: string | null;      // null = root of the conversation
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  status: 'complete' | 'streaming' | 'stopped' | 'error';
  error?: string;
  tools?: ToolId[];             // tools attached to the originating user turn
  attachments?: AttachmentMeta[];
  sources?: SourceRef[];        // simulated citations (clearly labeled)
  feedback?: 'up' | 'down' | null;
}
```

- Each conversation keeps `nodes: Record<id, MessageNode>` and an `activeLeafId` pointing at the current end of the **active thread**.
- The visible transcript is the path from `activeLeafId` up to the root, reversed. Sibling variants that are not on the path are preserved but hidden until selected.

## Operations and their exact semantics

| Operation | Behavior |
| --- | --- |
| **Send** | Append a `user` node under `activeLeafId`; append an `assistant` node (status `streaming`) under it; stream content into it. |
| **Stop** | Abort the stream; assistant node becomes `stopped` with whatever content arrived. Transcript intact. |
| **Retry (after error)** | The failed assistant node keeps its record; a fresh assistant **sibling** is created and becomes active. |
| **Regenerate** | Creates a new assistant **sibling** under the same user node and activates it. Previous variants remain switchable. |
| **Edit user message** | Creates a new user **sibling** under the same parent (copying tools/attachments), activates it, and auto-generates a response. The original message and its entire subtree (including previous responses) are **preserved** — nothing is deleted. |
| **Switch variant (`< 2/3 >`)** | Moves `activeLeafId` to the chosen sibling, then follows that branch's latest children so the continuation comes with it. |

Invariant: **no operation ever deletes nodes** except explicit conversation deletion. Editing and regenerating only add siblings and move the active leaf.

## Conversation record

```ts
interface Conversation {
  id: string;
  title: string;                // derived from first user message; renameable
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  archived: boolean;
  temporary: boolean;           // in-memory only; never persisted
  nodes: Record<string, MessageNode>;
  activeLeafId: string | null;
}
```

- Titles: first ~48 characters of the first user message (word-boundary cut), updateable via rename.
- Sidebar grouping: Pinned first, then Today / Yesterday / Previous 7 days / Previous 30 days / Older by `updatedAt`.

## Persistence (schema v1)

- Single key `universe:data`, JSON `{ version: 1, savedAt, conversations, preferences, providers, activeProfileId, activeModelId }`.
- **Temporary conversations are filtered out before every write** and disappear on reload by design.
- Writes are debounced (400ms) and triggered by store subscriptions.
- Load path: parse → validate shape (`version === 1`, arrays/records present) → hydrate. On malformed data the raw payload is quarantined under `universe:backup:<timestamp>`, a fresh demo seed is created, and the app continues (safe recovery, no crash).
- `clearHistory` removes all non-temporary conversations. `resetDemoData` restores the factory seed (preferences kept).

## Provider and capability model

- Provider profiles are local configuration concepts (`openai | anthropic | google | openai-compatible | local`) with endpoint URL and a model list. The API-key field is a **disabled explanatory placeholder** — no credentials are solicited, stored, logged, or transmitted in this milestone.
- Each model carries capability labels (`chat`, `search`, `research`, `images`, `voice`, `canvas`, `data-analysis`, `code`). Tool availability in the composer is derived from this registry — never from the presence of a key.
- Connection testing is a labeled simulation ("Simulate connection test") producing a deterministic demo result.

## Chat adapter contract (vendor-neutral)

```ts
interface ChatAdapter {
  id: string;
  stream(req: ChatRequest, handlers: ChatStreamHandlers, signal: AbortSignal): Promise<void>;
}
// events: start → delta* → done | error   (abort resolves as done/stopped)
```

Components consume domain types only; the mock adapter is deterministic (hash-seeded response selection, no randomness) and supports a documented `/fail` trigger to exercise error/retry states. No vendor SDKs or response shapes are referenced anywhere in the UI.
