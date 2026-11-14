# contracts-guide.md — the shared boundary

`packages/contracts/` is the **only** coupling point between the
frontend and the backend: shared DTOs, runtime zod schemas, and the SSE
event types. The frontend keeps typed *mirrors* (no runtime dependency,
so the static build stays self-contained — see the note in
`frontend/src/services/api/client.ts`), and the backend imports the
package directly; both sides are held to the same shapes by tests.

## The rules

1. **A contract change updates both sides in the same change.** The
   schema in `packages/contracts/src/<domain>.ts`, the frontend mirror
   (e.g. `frontend/src/services/api/server<Domain>.ts`), and the
   backend route/service that produces the payload move together.
2. **The backend never imports frontend stores; UI components never
   import DB entities.** Contracts are the vocabulary both may share.
3. **Counts are derived, never claimed.** List endpoints return
   `Page<T>` envelopes (`items` + `nextCursor`); the workspace export
   computes its `counts` from the exact rows it serializes.
4. **Secrets never appear in DTOs.** Credential shapes expose presence
   and verification state only (see `connectorCredentialDtoSchema`,
   `providerCredentialViewSchema`, `mcpServerDtoSchema`).

## Layout

| File | Domain |
| --- | --- |
| `api.ts`, `error.ts`, `pagination.ts`, `health.ts`, `me.ts` | API constants, the error envelope, page envelopes, liveness/readiness, `/me` |
| `conversations.ts`, `runs.ts` | the message tree, run lifecycle + ordered events |
| `employees.ts`, `memory.ts`, `library.ts`, `workspace.ts` | agent profiles, memory notes + journal, artifacts, the export snapshot |
| `agent.ts`, `agentTools.ts` | agent sessions, permission requests, the tool roster + input schemas |
| `providers.ts`, `providerDescriptors.ts` | provider connections, readiness axes, per-protocol policies |
| `connectors.ts`, `work.ts`, `routines.ts`, `files.ts`, `plugins.ts`, `mcp.ts`, `backup.ts` | the connector catalog, Work tasks, cron routines, knowledge files, plugin grants, MCP servers, the backup format |

Everything is re-exported from `src/index.ts`.

## The test suite (RF-117…RF-139)

The package has its own Vitest suite (`npm test`), one file per domain
under `packages/contracts/tests/`:

- **Accept/reject cases per schema** — required fields, enum
  vocabularies, bounds, and the honest invariants (the file extraction
  status includes `unsupported`; run statuses include `skipped`;
  readiness is per-axis).
- **Cross-contract truths** — the versioned backup tolerates
  unimplemented sections; client-creatable conversation nodes can never
  be `streaming`; only the backup format can carry a mid-stream freeze.
- **The public-surface guard** (`tests/index.test.ts`) — the barrel
  re-exports every module, so removing or renaming a contract fails a
  test with the missing name.
- **The drift guard** (`tests/workspace.test.ts`) — the export payload
  must carry all six sections and one counter per section. This is the
  exact bug class that broke the backend CI on 2026-11-13 (RF-112): a
  test's inline type declared four sections while the payload and the
  counts assertion had six.

CI runs the suite in the *Contracts (shared schemas)* job on every push
to `main` (RF-139).

## Changing a contract, step by step

1. Edit the schema in `packages/contracts/src/<domain>.ts`.
2. Extend `packages/contracts/tests/<domain>.test.ts` with the new
   accept/reject cases in the same change.
3. Update the frontend mirror (`frontend/src/services/api/…`) and the
   backend producer (`backend/src/modules/…`) together.
4. Run all three suites (`docs/testing.md`); each `npm run typecheck`
   also typechecks the tests, so stale inline types fail locally.
