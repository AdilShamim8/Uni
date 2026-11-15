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

- Effort commits: 30 (OA-001…OA-030) at the time of this handoff; the
  authoritative ledger is `commit-manifest.md`, updated after every push.
- Imported upstream history (65k files) and the prior RF engagement (202
  commits) are **not** part of this count, by contract.
- Toward the 500 target: 30/500. The remaining scope is real product work
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


## Session 2 addendum (2026-11-15)

- The root CI workflow became the real verification channel: five distinct
  failure classes were found on GitHub-hosted runners and fixed one by one
  (OA-025 nested-checkout git blob addressing + ripgrep fallback; OA-026
  ratchet base ref; OA-027 pnpm arg separator; OA-028 relative diffs;
  OA-029 raw-copy baseline entry). `pnpm check` is fully green (31 lanes,
  run #8); `pnpm lint` and the engine unit-test shard passed in run #6.
- Open for next session: confirm run #9 green; address the Control UI perf
  budget drift warnings (documented in verification.md); then continue the
  O10+ migration/adapter work.

## Session 3 addendum (2026-11-15)

- **CI correction (supersedes earlier reads): runs #8–#11 all FAILED at
  `pnpm check --base` (step 7).** The session-2 "check fully green in run
  #8" and the early session-3 "run #9 green" reads were wrong (in-flight
  statuses misread; the green `CI #397` run is a separate workflow). See
  verification.md §Session 3 for the full correction and the investigation
  record: the confirmed failing lanes are the native-TypeScript ratchets
  (`check:database-worker-ratchet`, `check:database-dialect-ratchet`), which
  die with `Unexpected EOF while reading from child process`; reproduced
  locally, bisected to a scale/combination-dependent tsserver child death
  (no single file). **Unresolved** — next session continues from the
  investigation record.
- Perf-budget drift **attributed** (see verification.md §Session 3): the uni
  theme's only bundled-CSS delta is +8 lines in
  `ui/src/styles/theme-backgrounds.css` (≤ 14 B gzip); the +9.9 KiB
  `total CSS gzip` and +43 B `document gzip` warnings are inherited
  upstream overages against budgets pinned "with no added headroom". No
  Uni-side budget change is warranted.
- Local `ui:build` verification: a scoped pnpm install builds through Solid
  settings compilation but fails late on path-named `@noble/hashes` chunks
  under the partial-install layout; the **pristine upstream tree fails
  identically**, so it is an environment artifact, not a regression (CI's
  full install is unaffected). Full local builds remain disk-blocked
  (10 GB volume; ~4+ GB `node_modules` beside the 1.6 GB repo).
- O15 advanced (OA-031): `data-migration.md` now carries the verified
  target-side map — the `openclaw migrate` plugin-provider contract,
  `plugin-sdk/migration(+runtime)`, `memory/imports/` layout, doctor-owned
  legacy session import, `mcpServers` config, and the database families —
  plus the `extensions/migrate-uni/` adapter design. Effort count: 36/500
  (authoritative ledger: `commit-manifest.md`, 36 rows including the
  session-3 ledger-sync commits; this row includes the sync commit that
  records it).
- Open for next session: write the `extensions/migrate-uni/` provider
  skeleton + tests (needs seeded-data hardware), then the visual acceptance
  pass for the uni theme once a browser environment exists (O07).
