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
