# PROJECT_CONTEXT.md — Uni product and technical summary

Last updated: 23 October 2026 (B00 session). Owner of truth for statuses:
`docs/backend-roadmap.md` and `docs/verification.md`.

## Product

Uni is an independent, open-source AI workspace where people bring their
own model connections. Five destinations:

1. **Chat** — branched conversations with models (message tree, sibling
   variants, active path, streamed replies).
2. **Work** — outcome-first tasks: describe a goal, watch the run, answer
   inline questions, review output, refine with follow-ups.
3. **Agents / AI employees** — persistent profiles with explicit memory
   notes, assigned work, plugin access; selecting one opens its real
   conversation.
4. **Plugins** — permissioned built-in tools (Documents, data analysis,
   Library context) with per-thread grants and honest receipts; external
   entries stay unconnected until a real connector exists.
5. **Library** — shared artifacts with immutable versions, working drafts,
   projects, Canvas documents.

Product principle: provider-independent workspace, user-supplied model
connections, persistent employee conversations, permissioned tools, and
conversational Work. Deployed frontend: https://universe-mu-two.vercel.app/

## Current architecture (B00)

- **Frontend** (`frontend/`): React 18 + TypeScript + Vite. React Router,
  Zustand stores, react-markdown, Papa Parse. Fully local mode: versioned
  localStorage slices; browser-side BYOK streaming for
  OpenAI-compatible/Anthropic; separate credentials slice excluded from
  exports; workspace backup/restore. Tests: Vitest + Testing Library
  (41 files / 278 tests green after B00).
- **Backend** (B-gates, under construction in `backend/`): TypeScript
  modular monolith — Fastify, PostgreSQL + Drizzle, Better Auth, Zod,
  Vercel AI SDK for provider transport; pg-boss worker for durable Work.
  See `docs/backend-roadmap.md`.
- **Contracts** (`packages/contracts/`): shared DTOs, zod schemas, stream
  event types — the only coupling point between frontend and backend.

## Boundary decisions (fixed)

- Browser: rendering, interaction state, unsent drafts, explicitly
  selected local demo mode.
- API: identity, authorization, canonical records, provider secrets,
  context resolution, validation, stream normalization, tool dispatch.
- Worker: durable Work execution, bounded retries, cancellation
  checkpoints, later routines.
- PostgreSQL: canonical account/workspace data and durable events. In
  server mode the server is the source of truth; Zustand is a view/cache.
- File storage: private storage interface; local volume for development,
  explicitly configured private object store for hosted use.

## Non-negotiables

Encrypted workspace-scoped credentials (never exported, never logged,
never sent back to the browser); idempotent imports that preserve local
originals; temporary chats excluded from persistence/exports; truthful
status labels everywhere; permissive-licensed reuse only, recorded in
`docs/opensource-reuse.md`.

## Key references

- `frontend/docs/architecture.md`, `conversation-model.md`,
  `feature-status.md`, `milestone-07-audit.md`
- `docs/backend-roadmap.md` — B00–B08 gates and status
- `docs/frontend-backend-map.md` — feature → API mapping (per gate)
- `docs/handoff.md` — resumption point
