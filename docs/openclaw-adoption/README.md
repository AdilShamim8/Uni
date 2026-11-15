# OpenClaw adoption — developer guide

Uni's active runtime is [OpenClaw](https://github.com/openclaw/openclaw),
imported as the complete pinned source tree under `engine/openclaw`
(upstream commit `c5381ef2d215b90a5e5b870543f2c12468f3a66b`, package version
`2026.11.3`, MIT license © 2026 OpenClaw Foundation — attribution preserved;
see `THIRD_PARTY_NOTICES` inside the engine tree).

The Uni Control UI is the upstream Control UI restyled as Uni: a `uni` builtin
theme family (muted indigo, neutral canvases, Inter), Uni display identity,
and the same Gateway, protocol, runtime and storage contracts.

## One-time setup

Requirements (upstream `engines` field): Node `>=24.16.0 <25 || >=26.1.0`,
package manager `pnpm@12.15.0` (pinned in `engine/openclaw/package.json`;
corepack supplies it: `corepack enable && corepack prepare pnpm@12.15.0 --activate`).

```bash
# from the repository root
./scripts/openclaw-workspace.sh pnpm install --frozen-lockfile
./scripts/openclaw-workspace.sh pnpm build
```

`scripts/openclaw-workspace.sh <cmd>` runs any command inside
`engine/openclaw` — the workspace root where `pnpm-workspace.yaml`,
`pnpm-lock.yaml`, patches and overrides must stay together.

## Running the product (self-hosted, trusted operator)

Follow upstream's documented Gateway start with an explicit, isolated state
directory (never the operator's home `~/.openclaw`):

```bash
cd engine/openclaw
OPENCLAW_STATE_DIR=/path/to/uni-state pnpm start   # or the upstream CLI entry
```

The Gateway serves the Control UI on its configured port; the UI connects to
the Gateway WebSocket on the same origin. Port bindings, health probes and
WebSocket proxying are configured through upstream's documented configuration
(`engine/openclaw/docs/`), not through a new Uni mechanism.

Security model (unchanged from upstream): a trusted-operator private
deployment. A shared login page does not create multi-tenant isolation; keep
state, keys and operator tokens private.

## Checks

```bash
./scripts/openclaw-workspace.sh pnpm check
./scripts/openclaw-workspace.sh pnpm lint
./scripts/openclaw-workspace.sh pnpm test:ui
./scripts/openclaw-workspace.sh pnpm ui:build
```

## Upstream updates

The engine tree is pinned; do not chase `main` during the migration gate. To
adopt a newer upstream release later: fetch the selected commit, review the
change and advisories, re-import (see `scripts/` import tooling and
`docs/openclaw-adoption/source-manifest.jsonl`), regenerate the parity
manifest, re-apply the Uni delta (`docs/openclaw-adoption/uni-delta-manifest.json`),
then re-run the checks above. Keep the same engine layout so the delta stays
reviewable.

## Old Uni stack during transition

`frontend/`, `backend/`, `packages/contracts/` remain in the repository as
transitional legacy code for data migration and rollback. They do not serve
the live product after the cutover and are retired only after migration
acceptance (see `docs/openclaw-adoption/data-migration.md`).
