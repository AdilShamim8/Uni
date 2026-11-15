# Data migration — old Uni stack to OpenClaw

Scope: migrating user-visible data from the legacy Uni stack
(`backend/` PostgreSQL via Drizzle + browser local storage) into OpenClaw's
state model (`engine/openclaw`, SQLite or PostgreSQL via its own schema
families: state, agent, workboard, logbook, team-reports, quarantine,
managed-update, package-activation — `src/infra/database-engine/types.ts`).

Status: **target-side map complete (O15).** No migration has been executed;
the field-level adapter design below is grounded in upstream's documented
migration-provider contract and bundled provider implementations
(`extensions/migrate-hermes/`, `extensions/migrate-claude/`,
`extensions/codex/`). Adapter code and execution remain future work, per the
adoption contract (preview before commit, idempotent re-runs, deterministic
ID maps, preserved originals until verification, read-only archive for the
rest).

## Upstream migration machinery (verified in `engine/openclaw`)

The target system already ships a general, plugin-owned migration framework.
The Uni legacy migration should be a **plugin migration provider** in that
contract, not a bespoke script:

- CLI: `openclaw migrate list|plan|apply <provider>` with `--dry-run`,
  `--from <path>`, `--agent <id>`, `--item <id>`, `--overwrite`, `--json`,
  `--include-secrets`/`--no-auth-credentials`, `--backup-output`, `--no-backup`
  + `--force` (`docs/cli/migrate.md`).
- Plugin registration: `openclaw.plugin.json` declares
  `"contracts": { "migrationProviders": ["uni-legacy"] }`; the entry calls
  `api.registerMigrationProvider(provider)` (pattern:
  `extensions/migrate-hermes/index.ts`).
- Provider shape (`src/plugins/migration-provider.types.ts`):
  `id`, `label`, `description`, `supportedItemKinds`, optional `deferredApply:
  { retrySafe: true }`, and methods `detect(ctx)`, `plan(ctx)`, `apply(ctx,
  plan?)`; `prepareApply(ctx)` for disposables.
- Item kinds: `auth | config | secret | memory | skill | workspace | session |
  file | archive | manual` (+ open strings); actions `copy | create | update |
  merge | append | archive | skip | manual`; statuses `planned | migrated |
  skipped | warning | conflict | error`; `sensitive` flag and `sourceRevision`
  (sha256 digest) on items.
- SDK helpers: `openclaw/plugin-sdk/migration` (item construction, summary
  counts, config-path patch items, manual items, redaction) and
  `openclaw/plugin-sdk/migration-runtime` (conflict-aware file copies,
  archive-only report copies, cached config-runtime wrappers, migration
  reports). SQLite access via `openclaw/plugin-sdk/sqlite-runtime`.
- Safety model (core-owned): preview-first plans, redacted JSON, pre-apply
  verified backup (`openclaw backup create`), conflict refusal without
  `--overwrite`, exclusive local state ownership (Gateway must be stopped),
  post-apply `openclaw doctor`.

## Source inventory (old Uni) → target-side map

`backend/src/db/schema.ts` (Drizzle, 1,051 lines) defines the tables below;
browser local storage holds provider keys in local mode. Target columns cite
verified upstream surfaces.

| Source table | Content | Target surface (verified) | Migration disposition |
| --- | --- | --- | --- |
| `user`, `session`, `account`, `verification` | Better-auth identities/sessions | None — trusted-operator boundary | Not migrated as-is; archive rows in the migration report as `manual` items (see Security below) |
| `workspace`, `workspace_members` | Old workspace concept | One OpenClaw home/state dir per trust boundary (`~/.openclaw` default layout, `docs/concepts/storage-locations.md`) | Map each workspace → one profile/state dir; members list archived as `manual` |
| `conversations`, `conversation_nodes` | Branched conversation trees, per-node metadata | Per-agent session store: `~/.openclaw/agents/<agentId>/agent/openclaw-agent.sqlite` rows + archived transcript JSONL under `~/.openclaw/agents/<agentId>/sessions/` (`docs/concepts/session.md` §Where state lives) | Adapter writes session rows + transcript JSONL in upstream's own format, then `openclaw doctor --fix` validates/imports through the same legacy-import path it already owns; branch tree recorded in item `details` (OpenClaw sessions fork rather than branch) |
| `provider_connections` | BYO-key provider configs | Agent auth store; credentials only via provider auth flows (`--include-secrets` contract) | Keys re-entered deliberately via OpenClaw provider auth; never exported through Git or ordinary dumps |
| `runs`, `run_events` | Historical model runs + streaming events | Migration report directory (archive-only convention from Hermes `sessions/`) | Read-only archive; representative journeys re-verified post-import |
| `employees`, `agent_sessions/runs/events/turns/allowances/pending_permissions` | Agent profiles + execution history | Agent config (workspace `AGENTS.md`, per-agent dirs) + archived history | Agent instructions/memory migrate to OpenClaw agent config; execution history stays archived |
| `memory_notes`, `memory_journal` | Agent memory + journal | `memory/imports/<source>/` in the selected agent workspace — indexed for `memory_search`, kept separate from bootstrap `MEMORY.md` (`docs/concepts/memory.md` §Imported memory) | Copy as Markdown files under `memory/imports/uni/`; exact-copy verification by sha256 `sourceRevision` |
| `routines`, `routine_runs` | Scheduled routines + history | Cron definitions in the shared state database (`docs/cli/cron.md`; jobs, delivery, scratch storage) | Map to OpenClaw cron definitions **imported disabled**; run history archived as `manual` items |
| `work_tasks`, `work_runs` | Work board tasks + steps | `workboard` database family (`DatabaseEngineFamily`, `src/infra/database-engine/types.ts`) | Map through the workboard family where the schema allows; remainder archived |
| `library_artifacts`, `library_artifact_versions` | Artifact library + versions | Workspace files + storage locations (`docs/concepts/storage-locations.md`); `file` item kind for copies | Migrate with deterministic ID maps; verify by content hash |
| `file_documents` | Uploaded files | Storage locations / agent workspace `file` items | Migrate by content hash into OpenClaw file storage |
| `connector_credentials`, `plugin_grants`, `plugin_receipts`, `mcp_servers` | Integrations and grants | `mcpServers` config records (`src/config/mcp-config.ts`; canonicalize via `canonicalizeConfiguredMcpServer`); grants via upstream permission flows | Credentials re-entered deliberately; grants/plugins re-configured through upstream permission flows |
| `import_batches`, `import_id_map`, `db_metadata` | Prior import bookkeeping | None (migration report only) | Retained in archive only |
| `job_outbox` | Outbox queue | None | **Not migrated** — queue state is runtime-internal; old effects must never auto-fire |

## Adapter design (O15, next executable step)

`extensions/migrate-uni/` modeled on `extensions/migrate-hermes/`:

1. `openclaw.plugin.json` with `contracts.migrationProviders: ["uni-legacy"]`.
2. `provider.ts` — `buildUniLegacyMigrationProvider()` returning
   `{ id: "uni-legacy", label: "Uni (legacy)", supportedItemKinds: ["memory",
   "session", "file", "config", "archive"] }`.
3. `detect(ctx)` — locate the legacy export bundle (a snapshot of the old
   PostgreSQL export + local storage); report high confidence only when the
   bundle manifest validates.
4. `plan(ctx)` — itemized plan per the table map above; every item carries
   `sourceRevision` (sha256) and deterministic IDs; conflicts pre-marked.
5. `apply(ctx, plan)` — `copyMigrationFileItem` for workspace/memory files,
   `applyMigrationConfigPatchItem` for `mcpServers` config, session
   row/transcript writes via `sqlite-runtime`, archive-only copies via
   `archiveMigrationItem`, report via `writeMigrationReport`.
6. Tests follow the Hermes provider's suite shape (plan/apply identity,
   conflict, redaction).

## Required migration behavior (contract)

1. Preview: dry-run report of supported/unsupported sections and losses before
   any write; user confirms before commit.
2. Deterministic ID maps (old → new) with parent relationships preserved;
   re-running an import is idempotent (upsert by deterministic key, no
   duplicates).
3. Verification: counts, content hashes, reference integrity, and
   representative reload journeys.
4. Originals preserved (no destructive writes) until verification and
   rollback are proven.
5. Credentials: kept out of Git and ordinary exports; deliberate secure
   re-entry or a reviewed one-time secret migration only.
6. Incompatible historical content remains accessible as an owned read-only
   archive; it is never silently dropped or mutated.
7. Read-only history vs executable future: imported routines/plugins start
   **disabled**; enabling is an explicit operator action.

## Honest gaps at this stage

- The provider skeleton, session/transcript writer, and tests are **not yet
  written** — this file pins the verified target contract and per-table map
  they must implement.
- No representative dataset is present in this sandbox (no live PostgreSQL
  instance, no provider keys), so adapter development and testing need a
  disposable environment with seeded data on capable hardware.
- Legacy `sessions.json`/transcript-JSONL import is **doctor-owned**
  (`docs/cli/doctor/state-migrations.md`): the adapter should land sessions in
  upstream's own legacy layout and let `openclaw doctor --fix` claim them,
  rather than writing SQLite rows directly; direct row writes would bypass
  Doctor's verified-backup and idempotent-recovery guarantees.

## Security boundary change (must be communicated)

Old Uni was a multi-user web app (Better-auth accounts + workspaces).
OpenClaw is a trusted-operator private deployment. Preserving several
unrelated users requires **separate Gateway/state/credential boundaries per
user** — never one shared operator token. Legacy accounts without a dedicated
boundary stay in the read-only archive until a real isolation design is
accepted. Do not present the shared Gateway as multi-tenant SaaS.
