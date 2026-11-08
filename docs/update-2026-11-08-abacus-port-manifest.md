# Update 2026-11-08 — abacusai-bot backend port manifest

This manifest tracks the effort opened by the 8 November 2026 agent prompt:
port the backend architecture of abacusai/abacusai-bot (MIT) into Uni's
Fastify + PostgreSQL backend, keeping Uni's existing frontend contract
byte-compatible, plus the requested CI repairs. It is the count of record
for this effort.

## Immutable baseline

- `PORT_START_SHA = 153a0cd8b` (main after the three CI-repair commits
  `50dd05fa6`, `7dad4d604`, `153a0cd8b` — each pushed individually and
  verified by `git ls-remote`; all check-runs green on the tip).
- Working branch: **`task/abacus-port-300`**, created from that SHA. Every
  commit is pushed individually to this branch and verified by `git
  ls-remote` SHA comparison. Direct-to-main pushes are not used for port
  commits.
- Upstream source of record: abacusai/abacusai-bot @
  `925008cf` (MIT; LICENSE and UPSTREAM_NOTICE under
  `third_party/licenses/abacusai-bot/`).

## Counting rules (binding, carried over from the 2026-11-04 manifest)

1. A commit counts when it is a new non-merge commit on this branch after
   PORT_START_SHA, delivers a coherent independently reviewable
   improvement, carries its regression tests and related contracts, and is
   confirmed remotely present by SHA.
2. Documentation/checkpoint commits are counted in `new_commits` but
   tracked separately; both counters are reported — never only the larger
   one.
3. CI-repair commits pushed directly to main before the branch count as
   part of this prompt's deliverable but are recorded here as baseline
   context, not port commits.

## Scope (what "copy the backend, not the UI" means here)

Port, adapted to Uni's stack (Fastify + Drizzle + PostgreSQL + zod
contracts + Better Auth workspaces):

1. **Agent sessions** (abacus `packages/agent` + `apps/desktop` session
   services): workspace-scoped sessions with mode, model pinning, event
   history, and a permission-ask/respond flow over SSE — the abacus
   AgentMode/PermissionRequest/Gate vocabulary.
2. **Tool roster + permission gate** (abacus `permissions.ts`,
   `tool-policy.ts`, `roster.ts`): the single-table registry and the
   allow/refuse/ask gate with shell-prefix allowances, path containment,
   and per-origin web_fetch approval.
3. **Tool executors** (abacus tool builders, in-process equivalents):
   read/list/grep, write/edit, bash with output caps, web_fetch behind the
   URL guard. Mutating tools stay grant-gated.
4. **Routines** (abacus `cron-scheduler.ts` design): PostgreSQL
   slot-claiming scheduler with minute tick, missed-fire catch-up, and
   per-run records with honest terminal statuses.
5. **Connectors catalog** (abacus `registry.ts`): the static catalog as
   contracts data with honest not-connected labeling; no remote gateway
   (Uni has no Abacus.AI platform dependency — entries record what WOULD
   be needed, never claim a live connection).
6. **CI repairs** (delivered): undici/lockfile/typescript/toolchain
   restores — see verification.md session 5.

Explicitly NOT ported: the Electron desktop shell, renderer, oRPC/WebSocket
transport, Abacus.AI platform services (RouteLLM/credits/hosted
connectors), OAuth messaging lanes, sandbox runtime binaries, TUF updater,
native modules. The UI contract (`frontend/src/services/api/*` paths,
envelopes, SSE frame format) is untouched.

## Change rows (one per actual commit)

| ID | Scope | Summary | Commit | Remote check | CI |
| --- | --- | --- | --- | --- | --- |
| A000 | effort | Manifest + license attribution + branch opened | (this commit) | pending push | PR pending |
