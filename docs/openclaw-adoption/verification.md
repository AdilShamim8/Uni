# Verification record — Uni OpenClaw adoption

Maintained per O-phase. Every claim below was executed in this environment;
failures and environment limits are recorded, not hidden.

## O01 — current-state baseline (2026-11-15)

- Uni `main` at start: `10c86a8c8e19bfc4e3d5f6661108da1b1e6cd52a` (matches the
  owner's prompt snapshot).
- OpenClaw pinned upstream: `c5381ef2d215b90a5e5b870543f2c12468f3a66b`
  fetched and verified locally (65,113 tracked files, package version
  `2026.11.3`, MIT license).
- Adoption branch `task/uni-openclaw-adoption` created from that main; first
  push verified (`bfc669021216fbfb994a7219460d1adafa090c3e`).

## O02 — source import (2026-11-15)

- Import method: `git archive` of the exact pinned commit, extracted into
  `engine/openclaw`, then blob-for-blob parity verification
  (`scripts/verify-import.py`, outside the repo) comparing upstream
  `git ls-tree` against Uni's staged index (path, mode, blob hash).
- Result: **PARITY OK — 65,113/65,113 paths byte-identical, 0 missing,
  0 mode mismatches, 0 hash mismatches, 0 extra paths.**
- One byte-precision fix needed during import: upstream's
  `apps/android/gradlew.bat` blob carries CRLF bytes predating its own
  `eol=lf` normalization; Uni's root `.gitattributes` marks that path
  `-text` so staging keeps the upstream bytes exact. Recorded as a
  deliberate Uni-side delta (branding/parity, not functional divergence).
- `docs/openclaw-adoption/source-manifest.jsonl`: 65,113 entries
  (original path, destination path, upstream commit, mode, content hash).

## O03 — toolchain (2026-11-15)

- Node `v24.22.3` — satisfies upstream engines `>=24.16.0 <25`.
- pnpm `12.15.0` bootstrapped via corepack (upstream's pinned
  `packageManager`).
- `pnpm install --frozen-lockfile --ignore-scripts --filter 'openclaw'`
  (root workspace package) in `engine/openclaw`: **completed successfully**
  (984 entries in the virtual store; exit code 0). Registry access,
  lockfile integrity and the pinned package-manager toolchain are verified.
- Full-workspace `pnpm install` (all packages) was attempted twice and
  **failed with `No space left on device`** on this 10 GB sandbox volume:
  the imported tree + git history (~1.6 GB) plus a full dependency install
  (~4+ GB of `node_modules`) exceed the volume. The root-package install
  above is the verified subset; the full workspace install, `pnpm build`,
  `pnpm check`, `pnpm test:ui` and any Gateway/UI runtime journey are
  **environment-blocked on disk capacity** in this sandbox and must be run
  on a larger host (e.g. the owner's machine or CI runner) before
  O04/O05 claims.

## Conventions

- Commit authorship: `Adil Shamim <157037615+AdilShamim8@users.noreply.github.com>`.
- One-by-one contract: each commit is pushed individually, remote SHA
  compared to local HEAD, and appended to `commit-manifest.md`.

## O07/O08 — Uni theme & identity (2026-11-15, session 1)

- `uni` builtin theme family registered end to end: protocol IDs, catalog
  descriptor, palette CSS (muted indigo #565a78/#7a86b8 on neutral
  #121212/#f8f8f6 canvases), artwork pair rasterized with upstream's exact
  ffmpeg pipeline (byte-identical method, verified against knot-dark),
  Inter typeface (SIL OFL 1.1, self-hosted, license beside files).
- Identity: document title, PWA manifest, About strings (with
  built-on-OpenClaw attribution), favicon set (SVG + 32px/180px PNG + ico,
  pixel-verified non-blank). Default theme fallback chain now `uni`
  (preference defaults, selection parsing, boot script, settings restore).
- Settings appearance surface lists Uni with labels/description; the
  presented-theme fallback follows the default family.
- Not yet verified (needs capable hardware): `pnpm ui:build` output, browser
  visual pass at 390/820/1280 px light/dark, PerformanceObserver
  layout-stability checks, `test:ui` suites. Statuses in
  `capability-parity.md` remain `imported`/`configured` accordingly.

## O16 — root CI, first real runs (2026-11-15, session 2)

- `openclaw-engine.yml` (OA-021) triggered on the four later session-1
  pushes; GitHub's hosted runners completed install/build and exposed real
  failures in `pnpm check` (runs #1–#4, all red): ratchet scripts addressing
  blobs as `<rev>:<path>` and `:<path>` — repo-root-relative forms — fail in
  Uni's nested `engine/openclaw` checkout, plus one `spawnSync rg ENOENT`
  (ripgrep absent on the runner).
- OA-025 fix: all ratchet blob lookups now use the cwd-relative `./` form
  (`<rev>:./path`, `:./path`, `cat-file` inputs likewise) — verified
  empirically to work both nested and at a repository root; the database
  worker inventory's worktree scan falls back to `git ls-files` when
  ripgrep is missing (mirrors upstream's own dated-todo-scan fallback
  pattern). Every other git subcommand used by these scripts
  (`ls-tree -- <path>`, `ls-files`, `grep <rev> -- .`, `merge-base`,
  `rev-parse`) was verified cwd-safe from the nested directory.
- Run #5 (sha `417cb235e`) triggered by OA-025: result recorded below.

## O16 — CI iteration record (session 2, 2026-11-15)

Real failures found and fixed on GitHub-hosted runners (disk-capable hardware
this sandbox lacks):

- Runs #1–#4 (session-1 pushes): `pnpm check` failed on ratchet git
  invocation — `<rev>:<path>` blob addressing is repo-root-relative and broke
  in the nested `engine/openclaw` checkout, plus one `spawnSync rg ENOENT`.
  **OA-025**: cwd-relative `./` forms in shrink-ratchet (3 sites),
  assertion-safety (2), timeout-race (1); `git ls-files` fallback when
  ripgrep is absent (mirrors upstream's dated-todo-scan pattern).
- Run #5: 23/24 preflight lanes pass; remaining: `Could not resolve ratchet
  base ref: origin/main` (single-branch checkout has no origin/main).
  **OA-026**: explicit `--base` = pinned import commit OA-002 + full
  checkout; lint takes the same base.
- Run #6: `pnpm lint` PASSED and the **unit test shard PASSED** (thousands of
  upstream tests green on real hardware); `pnpm check` failed only on pnpm's
  `--` separator being forwarded into check.mts's strict parser.
  **OA-027** removed the separator.
- Run #7: `pnpm ui:build` PASSED; check failed only in line-cap ratchet —
  `git diff` paths arrived repo-root-relative (and included root-level files
  outside the engine tree), doubled onto the engine cwd.
  **OA-028**: `--relative` on the line-cap diff and shared
  `listRatchetRenames` (verified to work at repo root too).
- Run #8: **`pnpm check` fully green — all 31 lanes** (every ratchet +
  typecheck prod/scripts/test-root). `pnpm lint` failed on exactly one
  finding: `control-ui raw-copy baseline drift — ui/src/app/typography.ts
  object-property:label x1 "Inter"`. **OA-029** added the Inter label to
  `ui/src/i18n/.i18n/raw-copy-baseline.json` following upstream's convention
  (adjacent to the other typeface labels).
- Run #9 (sha `429945038`) triggered by OA-029: **failed at `pnpm check`**
  (final REST-API status, recorded in session 3 below; the session-2 record
  below was corrected — see the Session 3 correction). Runs #8–#11 all failed
  at the same step; runs #12–#18 (session-3 pushes) were in flight at the time
  of this record. PR #81's `CI` workflow run on `9c33fb093` (a separate,
  pre-existing workflow) succeeded.
- Also observed (run #6/#8, non-blocking warnings): Control UI perf budgets
  report `document gzip` +43 B, `total CSS` +9.9 KiB gzip over ceiling,
  `chat boot JS requests` 21 > 20. The `ui:build` step itself passed in runs
  #7/#8; the budget drift is recorded as open work for the next session
  (measure which deltas come from the uni theme's font/theme assets vs
  preexisting, then either trim or adjust budgets with upstream-style
  documented rationale).

## Session 3 (2026-11-15)

### CORRECTION of the session-2/session-3 early reads

- The earlier claim in this file that run #9 "completed successfully" was
  **wrong**: that status was read while the run was `in_progress`, and the
  green `CI #397` run that confirmed it is a *different workflow*
  (`pull_request` event). Final statuses via the Actions REST API: runs #8,
  #9, #10, #11 all **failed at step 7 (`pnpm check --base ...`)**; `pnpm
  lint`, `ui:build`, and the unit shard were not reached (skipped). The
  session-2 statement "pnpm check fully green (31 lanes, run #8)" is
  **retracted** — the green observation cannot have been from run #8's final
  state; it was most plausibly read from an in-flight or partial view. The
  commit that recorded this (OA-032) carried the wrong claim and is
  corrected by this section.

### Perf-budget drift attribution (the open item from session 2)

- Structure of the budget: `scripts/check-control-ui-performance.mts` counts
  only bundled `dist/assets/*.css|js` toward `total CSS gzip`; public assets
  (`ui/public/themes/uni.css`, `ui/public/fonts/inter.css`, the Inter woff2
  pair) are copied verbatim to `dist/` root and are **outside** the budget.
- Exhaustive source diff of the two trees (`diff -rq openclaw-upstream/ui`
  vs `engine/openclaw/ui`, excluding `node_modules`) finds the **only
  bundled-CSS source delta** is `ui/src/styles/theme-backgrounds.css`
  (+8 lines: the two uni background rules) — 2,908 → 3,123 raw bytes,
  ≤ 14 B gzip. All other uni-theme CSS lives in public assets.
- Conclusion: the +9.9 KiB `total CSS gzip` drift and the `document gzip`
  +43 B warning are **inherited upstream overages**, not adoption deltas —
  upstream's own budget comments (`totalCssGzipBytes: 326_575`, "exact
  totals, with no added headroom") pin a baseline the pinned upstream tree
  itself exceeds. No Uni-side budget change is warranted; adjusting budgets
  we did not drift would mask upstream's own signal. The `chat boot JS
  requests 21 > 20` advisory needs a CI-side measurement (below) to
  attribute, but the request-count budget is unaffected by public theme
  assets.
- Verification attempted locally: a scoped pnpm install
  (`--filter openclaw --filter openclaw-control-ui --filter memory-core
  --filter nostr --filter whatsapp --filter @openclaw/mermaid-renderer`,
  ~1.1 GB, warm store) **builds the Control UI through Solid settings
  compilation (5,308 modules transformed)** but then fails in
  `refreshControlUiBuildOutput`: rolldown emits `@noble/hashes/sha2.js` and
  `@noble/hashes/utils.js` as path-named chunks, which the offline-shell
  inventory then cannot read. **The pristine upstream tree fails
  identically under the same scoped layout** (verified by building
  `openclaw-upstream` at the pinned commit), so this is an environment
  artifact of the partial install, not a Uni regression; CI's full
  214-package install does not exhibit it (runs #7–#9 passed `ui:build`).
  Consequence: full `ui:build` output and byte-exact budget attribution
  cannot run in this 10 GB sandbox (full install needs ~4+ GB of
  `node_modules` beside the 1.6 GB repo); CI remains the measurement
  channel for O04+ claims.

### O15 — target-side migration map (OA-031)

- Verified upstream migration machinery and filled the per-table
  target-side columns of `data-migration.md`: the `openclaw migrate`
  plugin-provider contract (`docs/cli/migrate.md`,
  `src/plugins/migration-provider.types.ts`, `extensions/migrate-hermes/`
  as the reference implementation), the `plugin-sdk/migration(+runtime)`
  helper surface, the `memory/imports/<source>/` import layout, the
  doctor-owned legacy `sessions.json`/transcript-JSONL import path, the
  `mcpServers` config surface, and the SQLite/PostgreSQL database
  families. Adapter code is the pinned next step; no migration has run.

### CI `pnpm check` failure — investigation status (UNRESOLVED, next session)

- Runs #8–#11 fail deterministically at `pnpm check --base bcb7b412…` on
  hosted runners (step 7); lint/tests are skipped after it. Reproduced
  locally: `check-database-worker-ratchet.mts` dies with `Unexpected EOF
  while reading from child process` during the semantic-compat phase, and
  `inspectDatabaseWorkerBoundaries` fails on the ui/src set with "An error
  was suppressed during disposal". Bisection: the full 7,099-file ui/src
  set fails; the suspect `ui/src/types/solid-elements.d.ts` passes alone,
  with its local import chain, and with the whole `ui/src/types/` directory —
  the crash is **scale/combination-dependent tsserver child death**, not one
  file. The ratchet lanes that spawn the native TypeScript session
  (`check:database-worker-ratchet`, `check:database-dialect-ratchet`) are the
  confirmed failures; other locally-failed lanes (wildcard re-exports, tool
  display, duplicate scan, opengrep, npm lock) failed on missing modules in
  the *scoped* sandbox install and are not trusted evidence. Next session:
  obtain run #12+ step results once they land; if the same lanes fail there,
  compare against upstream's own CI expectations for these ratchets at the
  pinned commit (possible upstream-env mismatch: Node 24 vs upstream's
  engines, or `typescript@7.1.0-dev` native-preview child stability under the
  runner), and bisect with a smaller synthetic set on capable hardware.
- **No fix has been committed for this failure class yet.** The branch
  remains red on `pnpm check`; treat all "green" claims for check as void
  until a run completes green.

