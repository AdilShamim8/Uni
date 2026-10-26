# AGENTS.md — Uni repository context

Uni is an independent, open-source, provider-independent AI workspace with
five destinations: **Chat, Work, Agents / AI employees, Plugins, Library**.
This repository hosts the frontend (React 18 + TypeScript + Vite under
`frontend/`) and, as of the B-gates, a TypeScript backend under `backend/`
plus shared API contracts under `packages/contracts/`. The repo was renamed
from "Universe" to "Uni"; older branch names may still reference Universe.

## What is working / demo / deferred (current honest status)

- Working (local mode): chat message tree with branches, demo adapter,
  browser BYOK streaming for OpenAI-compatible and Anthropic protocols,
  Work demo runner plus live BYOK drafting/revisions, employees with memory
  notes and persistent threads, built-in plugins with grants and receipts,
  Library artifacts/versions, workspace backup/restore.
- Server mode: under construction gate by gate — see
  `docs/backend-roadmap.md` for what each gate claims and what remains.
- Deferred: real external connectors (GitHub/Gmail/Drive), PDF/OCR
  extraction, routines execution, MCP. Anything not implemented stays
  labeled unconnected/inactive — never relabel demo output as live.

## Ownership and commands

- `frontend/` — see `frontend/AGENTS.md`. Commands: `cd frontend && npm ci`,
  `npm run dev`, `npm run build` (typecheck + vite), `npm run lint`,
  `npm run test` (vitest).
- `backend/` — see `backend/AGENTS.md`. Commands are documented in
  `backend/README.md`.
- `packages/contracts/` — shared DTOs, zod schemas, and stream event types.
  Contract changes must update both sides in the same change; the backend
  never imports frontend stores, and UI components never import DB entities.

## Non-negotiable rules

- Migrations never destroy user data. Local (localStorage) originals stay
  intact until an explicit, verified import succeeds; imports are idempotent.
- Provider credentials are secrets. In local mode they live only in the
  browser's separate credentials slice (never in exports). In server mode
  they are encrypted at rest, scoped to a workspace, redacted in every API
  response, and never logged.
- Temporary chats must not be persisted or exported while labeled temporary.
- Reuse only suitably licensed open-source code; record every adapted file
  in `docs/opensource-reuse.md`, keep license texts under
  `third_party/licenses/`, and maintain `THIRD_PARTY_NOTICES.md`.
- Never fake success: no placeholder endpoints, no fabricated live results,
  no invented usage numbers. Status labels stay truthful.
- Git: work on feature branches, commit coherent tested increments one at a
  time, never force-push, never merge into `main` merely to finish a
  milestone.

## Where the truth lives

- `docs/backend-roadmap.md` — gate-by-gate implementation status.
- `docs/verification.md` — actual commands and results per session.
- `docs/frontend-backend-map.md` — feature → API → backend mapping.
- `docs/handoff.md` — current commit, next action, environment blockers.
- `docs/opensource-reuse.md` — reuse ledger (packages + adapted files).
