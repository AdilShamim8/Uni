# Handoff — Uni OpenClaw adoption

Session 1 (2026-11-15). Read this together with
`docs/openclaw-adoption/baseline.md`, `verification.md`, `commit-manifest.md`
and `capability-parity.md`.

## Where the effort stands

- Branch `task/uni-openclaw-adoption`, based on
  `OPENCLAW_ADOPTION_START_SHA` = `10c86a8c8e19bfc4e3d5f6661108da1b1e6cd52a`
  (Uni `main` at adoption start).
- Complete pinned OpenClaw source imported at `engine/openclaw`
  (`c5381ef2d215b90a5e5b870543f2c12468f3a66b`, 65,113 paths, byte-exact
  parity against the upstream tree — see `source-manifest.jsonl` and the
  `verification.md` O02 record).
- OpenClaw is the selected foundation and the active runtime target: no new
  agent framework was written; all changes are branding, theme, configuration
  and documentation deltas (see `uni-delta-manifest.json`).
- The Control UI is restyled as Uni through the supported theming surface:
  `uni` builtin theme family (muted indigo, neutral canvases, Inter typeface),
  Uni display identity (title/PWA/About), Uni favicon set, and `uni` as the
  default theme on first run. Existing stored profiles keep their saved
  preference.
- Developer entrypoint: `scripts/openclaw-workspace.sh` + the adoption guide
  under `docs/openclaw-adoption/README.md`.

## Verified in this session

- Import parity: 65,113/65,113 paths byte-identical (mode + blob hash),
  0 missing/extra.
- Toolchain: Node v24.22.3 satisfies upstream engines; pnpm 12.15.0 via
  corepack; `pnpm install --frozen-lockfile --ignore-scripts --filter 'openclaw'`
  (root package) completes; registry and lockfile verified.
- WebP artwork exports byte-identical to upstream's own ffmpeg pipeline
  (verified by re-encoding knot-dark and comparing).
- Every effort commit pushed individually with remote SHA == local HEAD.

## Honest blockers (unchanged by anything above)

1. **Disk capacity**: the 10 GB sandbox volume cannot hold a full workspace
   `node_modules` (~4+ GB) beside the repo. Full install, `pnpm build`,
   `pnpm check`, `pnpm test:ui`, Gateway boot, and any browser/visual journey
   are blocked **in this environment**. They must run on capable hardware
   (owner machine or CI runner) before O04+ can be claimed.
2. **No provider keys**: live inference stays fixture-verified at best.
3. **No Docker daemon** in this environment.

## Counts of record (this effort only)

- Effort commits: 23 (OA-001…OA-023) at the time of this handoff; the
  authoritative ledger is `commit-manifest.md`, updated after every push.
- Imported upstream history (65k files) and the prior RF engagement (202
  commits) are **not** part of this count, by contract.
- Toward the 500 target: 23/500. The remaining scope is real product work
  (verification on capable hardware, migration adapters, surface-by-surface
  restyle passes, CI wiring); padding the count with empty commits is
  forbidden by the adoption contract and will not happen.

## Next executable actions (in order)

1. On capable hardware: full `pnpm install --frozen-lockfile`, `pnpm build`,
   `pnpm check`, then the O04 unmodified-baseline Gateway/UI journey in an
   isolated state dir (the exact commands are in
   `docs/openclaw-adoption/README.md`).
2. Identify upstream's supported import/config APIs and fill the target-side
   columns of `data-migration.md` (O15).
3. Root CI: adapt upstream checks to run from the repo root with the engine
   working directory (O16) — do not enable upstream publishing workflows.
4. Visual acceptance pass for the uni theme at 390/820/1280 px, light/dark
   (O07 acceptance) once a browser environment exists.
