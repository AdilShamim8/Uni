# frontend/AGENTS.md

The frontend is the product surface: a premium, restrained Apple-inspired
interface with a shared message surface across Chat, Work, and employee
threads. Preserve the message tree, themes, navigation, and responsive
behavior unless a milestone explicitly changes them.

## Rules of the road

- **Preserve the conversation model.** Messages are tree nodes with
  parent links, sibling variants, an active path, and stable IDs. Any
  persistence or API mapping must retain branching and message identity —
  see `frontend/docs/conversation-model.md`.
- **Call typed API services, not fetch scattered through components.**
  Server-mode integration goes through `src/services/api/` adapters that
  implement the existing domain interfaces (e.g. `ChatAdapter`).
- **Never store server credentials in the frontend.** The local BYOK
  credentials slice stays separate from serialized app data and excluded
  from exports; server-mode keys never reach the browser at all.
- **UI checks are presentation only.** Plugin grants, ownership, and
  authorization are enforced server-side in server mode; the browser only
  renders state it receives.
- **Retain local data until migration is verified.** Local-mode records,
  drafts, and backups are not deleted on sign-in; an explicit import with
  dry-run + confirm moves them, and originals survive verification.
- **Isolate modes.** Local demo mode and server mode must not split writes
  between stores; sign-out clears server-derived state from caches.
- **Test what you touch.** Desktop and mobile behaviors affected by auth,
  settings, or streaming changes need coverage in `frontend/tests/`
  (Vitest + Testing Library, jsdom). Keep the suite green:
  `npm run test -- --maxWorkers=1 --minWorkers=1` for isolated runs.

## Commands

```bash
cd frontend
npm ci            # install from lockfile
npm run dev       # vite dev server
npm run build     # typecheck + production build
npm run lint      # eslint
npm run test      # vitest run
```

## Layout

- `src/domain/` — pure logic: types, conversation tree, context
  resolution, CSV analysis, adapters' interface.
- `src/services/` — mock/live adapters, provider connections, storage
  slices, backup, canonical saves, plugin dispatch.
- `src/state/` — Zustand stores (app, agents, work, library, plugins).
- `src/features/` — routed surfaces (chat, agents, work, library,
  plugins, canvas, conversation shared components).
- `tests/` — Vitest suites; `tests/helpers.tsx` is the shared harness.
