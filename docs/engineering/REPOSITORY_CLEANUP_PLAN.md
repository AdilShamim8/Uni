> **Historical record.** This plan was executed (and superseded) by the v0.3 restructure: engines extracted, legacy app retired, workspace promoted to root — see docs/DECISIONS.md ADR-010…013.

# Repository Cleanup Plan — ReWoo

**Scope:** safe, incremental cleanup of the ReWoo monorepo. Every step is reversible, evidence-based, and preserves working software and Git history. No step deletes user data, credentials, or vendored license notices.

**Authority:** master engineering prompt §5 (cleanup authority + rules) and AGENTS.md ground rules 3–6. Each cleanup item below names the verification command that must pass before it is considered done.

---

## Guiding rules (binding)

1. Inspect a file's purpose and references **before** removing or renaming it.
2. Preserve uncommitted user work; establish a feature branch + reviewable checkpoints before major cleanup.
3. Never force-push, rewrite shared history, or delete production data, uploads, credentials, secrets, or keys.
4. Run relevant tests and inspect the diff after each increment (one focused commit per increment).
5. Document what was deleted/replaced and why (this file + commit message).
6. Engines extraction requires **owner sign-off** (ADR-007) — do not act unilaterally.

---

## Completed

| ID | Change | Date | Evidence |
|----|--------|------|----------|
| C-0 | Phase Zero audit, defect register, cleanup plan, reuse register created | 2026-10-15 | `docs/engineering/*`, `docs/research/OPEN_SOURCE_REUSE_REGISTER.md` |
| C-1 | "YOU" placeholder brand removed from all product-facing surfaces; internal modules and CSS utilities renamed (`you-client`→`rewoo-client`, `you-store`→`rewoo-store`, `components/you/`→`components/rewoo/`, `you-*`→`rewoo-*` classes, CI workflow renamed). Backward compat kept: `YOU_MASTER_KEY` env fallback, `.you-master-key` dev-file migration, unchanged KDF | 2026-10-15 | Branch `feat/rewoo-rebrand`; lint/typecheck/build green; browser+VLM screenshot verification; see DEFECT_REGISTER D15 |

## Planned (queue, dependency-ordered)

### C-2 — Rename workspace package identity (small, no path changes)

- Update `you/package.json` name (done: `rewoo-workspace`) and regenerate `bun.lock` workspace name on the next dependency change (D17, cosmetic).
- Verification: `cd you && bun install && bun run lint && bun run typecheck && bun run build` (CI mirrors this via `.github/workflows/rewoo-workspace-ci.yml`).

### C-3 — Rename the `you/` directory to `apps/workspace` (medium — needs ADR amendment)

- Why: last remaining placeholder name; the directory is developer-facing, not product-facing, so it is deliberately scheduled after the user-visible rebrand (D16).
- Touches: CI workflow `paths:` filters and `working-directory:`, root `README.md`, `AGENTS.md`, `context/*.md` cross-references (11 files), `you/README.md` internal links, `docker-compose.yml` (if wired later).
- Requires: amend ADR-002 in `context/DECISIONS.md`, one pure-rename commit (`git mv`), full CI green on both workflows.
- Risk: low — mechanical rename; no runtime code reads its own directory name.

### C-4 — Automated test suite for the workspace (quality, not strictly cleanup — unblocks retirement of manual verification)

- Vitest or Bun test runner: auth flow tests (signup/signin/signout, isolation via two users), vault round-trip (encrypt → decrypt → masked preview), provider adapter unit tests with recorded fixtures.
- Verification: `bun test` wired into `rewoo-workspace-ci.yml`.
- Tracked as T16 in `context/TASKS.md`.

### C-5 — Python engine security regression tests (D2/D3)

- Redirect-following SSRF regression for `web_fetch`; Windows/UNC path traversal regression for static serving.
- Verification: `pytest tests/ -k "ssrf or traversal"` green on Linux + Windows matrix (root `ci.yml`).

### C-6 — Engines extraction (BLOCKED on owner sign-off — do not execute without it)

- Options memo per ADR-007: (a) git submodules, (b) fetched tarballs via `scripts/fetch-engines`, (c) package-manager dependencies where published. Present trade-offs (clone weight vs. offline reproducibility vs. update friction) to the owner; record decision as ADR-009+.
- Until then: **do not delete or restructure `engines/`**; keep `THIRD_PARTY_NOTICES.md` in sync.

### C-7 — Optional, post-Milestone-3 hygiene

- Sweep `web/` Vite frontend modals for the keydown-listener leak (D10) if that frontend stays in service before workspace parity.
- OAuth state TTL sweep (D7) and SSE heartbeat (D8) on the Python engine.
- Consider a CODEOWNERS file and issue/PR templates refresh after open-source launch push.

---

## Explicitly NOT planned (and why)

- **No repository wipe or re-scaffold.** The Python engine, tests, research docs, and workspace app are working assets.
- **No deletion of `rewoo/web/dist` committed build** (D13) — it carries the "Python only, no Node needed" install promise; regenerating it stays a release-time step.
- **No blind placement of standalone open-source apps into the repo root** (per master prompt §6) — see the reuse register for per-project strategies instead.
- **No removal of legacy compatibility shims** (`YOU_MASTER_KEY` fallback, `.you-master-key` migration) before at least one minor release cycle has passed; removal would break pre-rebrand self-hosters.
