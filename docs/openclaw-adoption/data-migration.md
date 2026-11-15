# Data migration — old Uni stack to OpenClaw

Scope: migrating user-visible data from the legacy Uni stack
(`backend/` PostgreSQL via Drizzle + browser local storage) into OpenClaw's
state model (`engine/openclaw`, SQLite or PostgreSQL via its own schema
families: state, agent, workboard, logbook, team-reports).

Status: **scoping document.** No migration has been executed; this file will
carry the field-by-field map as adapters are written, per the adoption
contract (preview before commit, idempotent re-runs, deterministic ID maps,
preserved originals until verification, read-only archive for the rest).

## Source inventory (old Uni)

`backend/src/db/schema.ts` (Drizzle, 1,051 lines) defines the tables below;
browser local storage holds provider keys in local mode.

| Source table | Content | Migration disposition |
| --- | --- | --- |
| `user`, `session`, `account`, `verification` | Better-auth identities/sessions | Not migrated as-is: trusted-operator boundary replaces multi-user auth (see Security below) |
| `workspace`, `workspace_members` | Old workspace concept | Map each workspace → one OpenClaw profile/state dir per trust boundary |
| `conversations`, `conversation_nodes` | Branched conversation trees, per-node metadata | OpenClaw sessions are the target; branch structure documented per-field below |
| `provider_connections` | BYO-key provider configs | Keys re-entered deliberately via OpenClaw provider auth; never exported through Git or ordinary dumps |
| `runs`, `run_events` | Historical model runs + streaming events | Read-only archive; representative journeys re-verified post-import |
| `employees`, `agent_sessions/runs/events/turns/allowances/pending_permissions` | Agent profiles + execution history | Agent instructions/memory migrate to OpenClaw agent config; execution history stays archived |
| `memory_notes`, `memory_journal` | Agent memory + journal | Migrate into OpenClaw memory surfaces where APIs allow |
| `routines`, `routine_runs` | Scheduled routines + history | Map to OpenClaw cron definitions; **disabled on import** (no automatic schedules start) |
| `work_tasks`, `work_runs` | Work board tasks + steps | Map to OpenClaw workboard family where the schema allows |
| `library_artifacts`, `library_artifact_versions` | Artifact library + versions | Migrate with deterministic ID maps; verify by content hash |
| `file_documents` | Uploaded files | Migrate by content hash into OpenClaw file/media storage |
| `connector_credentials`, `plugin_grants`, `plugin_receipts`, `mcp_servers` | Integrations and grants | Credentials re-entered deliberately; grants/plugins re-configured through upstream permission flows |
| `import_batches`, `import_id_map`, `db_metadata` | Prior import bookkeeping | Retained in archive only |
| `job_outbox` | Outbox queue | **Not migrated** — queue state is runtime-internal; old effects must never auto-fire |

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

- The OpenClaw side of this map (target field names, import APIs) is not yet
  written: upstream's supported import/config APIs must be identified first
  (`engine/openclaw/docs/`, provider/config surfaces). This file records the
  source side and the contract; the target-side columns get filled when the
  adapter work begins (O15).
- No representative dataset is present in this sandbox (no live PostgreSQL
  instance, no provider keys), so adapter development and testing need a
  disposable environment with seeded data on capable hardware.

## Security boundary change (must be communicated)

Old Uni was a multi-user web app (Better-auth accounts + workspaces).
OpenClaw is a trusted-operator private deployment. Preserving several
unrelated users requires **separate Gateway/state/credential boundaries per
user** — never one shared operator token. Legacy accounts without a dedicated
boundary stay in the read-only archive until a real isolation design is
accepted. Do not present the shared Gateway as multi-tenant SaaS.
