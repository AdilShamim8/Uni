# backend/AGENTS.md

## Module boundaries

- `src/app.ts` is the only place the Fastify instance is assembled.
  Feature code lives in `src/modules/<name>/` and registers via
  `app.register`; shared concerns (auth scoping, error envelope,
  logging) live in `src/middleware/` and `src/lib/`.
- The workspace scope is always server-derived (session → membership).
  Never trust a `userId`, role, or `workspaceId` because the browser sent
  it.
- `packages/contracts` is the shared boundary: DTOs and zod schemas are
  defined there and consumed by both sides; contract changes update both
  sides in the same change.
- Frontend Zustand stores must never be imported here; DB entities must
  never be exported to UI components.

## Migrations

- Schema changes go through `src/db/schema.ts` + `npm run db:generate`
  (committed SQL under `drizzle/`) + `npm run db:migrate`. Never use
  schema push against production. Migrations must never destroy data.

## Secret handling

- Provider credentials are encrypted (AES-GCM, versioned envelope) at
  B03; master keys come from deployment secrets, never from the DB, never
  logged, never returned by any API (redacted metadata only).
- Logs run through pino with redaction paths; do not log user prompts or
  attachment contents by default.

## Durable runs (from B03/B06)

- Runs follow the explicit state machine; terminal states are truthful
  (never `complete` after a provider error).
- Idempotency keys deduplicate client retries; events are ordered and
  cursor-resumable.

## Tests

- Meaningful integration tests against disposable PostgreSQL (embedded
  binaries in tests; docker compose for the dev database). No fake
  success responses; no placeholder endpoints. Every claimed behavior
  has a test that fails when it regresses.

## License ledger

- Record every installed package and adapted upstream file in
  `docs/opensource-reuse.md`; keep `third_party/licenses/` and
  `THIRD_PARTY_NOTICES.md` in sync.
