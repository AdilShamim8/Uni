# O01 — Current-state inventory and migration baseline

Recorded 2026-11-15, start of the Uni OpenClaw adoption effort.

## Destination repository

- Repository: https://github.com/AdilShamim8/Uni
- Destination branch for this effort: `task/uni-openclaw-adoption` (created
  from `main` below; no existing adoption continuation branch was present).
- `OPENCLAW_ADOPTION_START_SHA` (immutable baseline): `10c86a8c8e19bfc4e3d5f6661108da1b1e6cd52a`
- Working tree at branch creation: clean (`git status` empty; no unrelated
  user changes to preserve).

## Upstream selection

- Upstream repository: https://github.com/openclaw/openclaw
- Selected `OPENCLAW_UPSTREAM_SHA` (pinned, frozen for the first integration
  gate): `c5381ef2d215b90a5e5b870543f2c12468f3a66b`
- Selection reason: this is the exact commit documented and verified in the
  owner's adoption prompt (`Uni_OpenClaw_Complete_Adoption_500_Commits_Agent_Prompt.md`);
  adopting that documented snapshot avoids chasing upstream `main`
  (currently `5fbdf6989130ed55dbe8dab52e4fd6d1dc61c214`, which continues to
  move) during the migration.
- Upstream snapshot facts (re-verified locally on the fetched commit):
  - package version `2026.11.3` in `package.json`.
  - engines: `>=24.16.0 <25 || >=26.1.0` (local Node `v24.22.3` satisfies).
  - package manager: `pnpm@12.10.0` via corepack field; package.json pins
    `pnpm@12.15.0` with an integrity hash.
  - MIT license, © 2026 OpenClaw Foundation.
  - 65,113 tracked files; no submodules; no Git LFS pointers; largest
    tracked file ≈ 5.7 MB (i18n translation memory).

## Host environment

- Node `v24.22.3`; pnpm absent (to be bootstrapped via corepack, O03).
- Python `3.12.16`; git `2.47.3`.
- Disk: ~8 GB free at baseline.
- No provider model keys are available in this environment; live inference
  is expected to remain fixture-verified, per the adoption contract.

## Prior work (historical, not part of this effort's count)

- `main` at the start SHA carries the prior RF/reuse-first engagement's 202
  effort commits (RF-001…RF-202) plus earlier project history. Those records,
  ledgers and handoffs remain intact and are explicitly **not** counted
  toward this effort's 500.
- Old Uni stack to preserve during transition: `frontend/` (React/Vite),
  `backend/` (Fastify/PostgreSQL), `packages/contracts/`, `infra/`,
  `scripts/`, `third_party/`, `docs/`.

## Startup commands observed on the existing product

- Old frontend: `npm run dev` under `frontend/` (Vite; see its README).
- Old backend: `npm run dev` under `backend/` (Fastify; see its README).
- No production startup path beyond `infra/docker-compose.yml` exists yet.

## Data/storage paths to protect

- Old stack stores data in PostgreSQL (backend `drizzle` schemas) and browser
  local storage; no on-disk Uni state directory exists in the repository.
- The import and all OpenClaw runtime state during adoption must use isolated
  development state directories (never the operator's home `~/.openclaw`).

## Effort conventions adopted from this repo

- Commit authorship: `Adil Shamim <157037615+AdilShamim8@users.noreply.github.com>`.
- Commit message style: `type(scope): OA-NNN — subject`, following the
  existing RF-NNN convention with a fresh OA-NNN sequence for this effort.
