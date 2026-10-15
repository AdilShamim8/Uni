# TEST RESULTS

Honest record. "Not run" is a valid and expected status.

| Date | Scope | Result | Evidence |
|---|---|---|---|
| 2026-10-15 | Phase Zero audit (docs) | N/A — documentation only | docs/engineering/CURRENT_STATE_AUDIT.md |
| 2026-10-15 | `you/` app — ESLint | **Pass** (0 errors, 0 warnings) | `eslint .` in the you/ app workspace |
| 2026-10-15 | `you/` app — browser E2E (manual, automated driver) | **Pass** — see matrix below | Automated browser session against the running dev server |

## YOU application — browser-verified flows (2026-10-15)

| Flow | Result | Notes |
|---|---|---|
| Landing page renders (all sections) | Pass | Nav, hero, pillars, capabilities, providers, roadmap, footer |
| Sign-up (new account) | Pass | Account created, session established, workspace entered |
| Sign-in / sign-out round-trip | Pass | Returns to landing; session cookie cleared |
| Demo brain chat: send → stream → render | Pass | Clearly labeled "Demo brain"; streamed incrementally |
| Conversation auto-title from first message | Pass | Titled "Hello! What can this workspace do?" |
| History persistence after reload | Pass | Conversation and messages reload from database |
| Models view (empty state) | Pass | Honest empty state with Settings CTA |
| Settings → Providers → Add credential | Pass | Dialog validates; real provider API round-trip; key masked in list |
| Credential validation failure honesty | Pass | Provider 403 (unsupported region) surfaced verbatim; stored as unverified |
| Planned views (e.g., Agents) | Pass | Shows Milestone 3 roadmap panel — no fake features |
| Mobile 390×844 layout | Pass | Drawer nav, composer usable; sidebar closed by default on mobile |
| Console / page errors during session | None | No console errors; no unhandled page errors |

## YOU application — NOT yet tested (honest gaps)

- **Live-model streaming with a real provider key.** The sandbox region is blocked by the provider (verification attempt returned a truthful 403 `unsupported_country_region_territory`), so full streaming against OpenAI could not be exercised from this environment. The adapters are implemented for all three protocol families; a live-key integration test from an allowed region is required before claiming "verified against live providers."
- Automated unit/integration tests for `you/` (auth, vault, gateway adapters) — not yet written.
- Multi-user isolation regression test (two accounts, cross-access attempts) — designed for, spot-checked by query construction, not yet scripted.
- Load testing — not performed (Milestone 7 scope).

## Python suite

**Status: not executed in this environment.** The suite must run in CI (Linux + Windows, Python 3.9–3.14) — tracked in TASKS.md Python track items. Historical failures are documented in BUGS_AND_ISSUES.md (D5).

## CI results (GitHub Actions, 2026-10-15)

| Workflow | Commit | Result | Scope |
|---|---|---|---|
| YOU CI | f38ef3057 | **Success** | bun install (frozen lockfile) → prisma generate → eslint → tsc --noEmit → next build |
| CI (pre-existing) | f38ef3057 | **Success** | Python matrix: ubuntu/windows/macos × Python 3.9/3.12 — `pip install requirements-dev`, `pytest -q`, `rewoo eval`; plus web/ typecheck |

The pre-existing CI passing on the full matrix closes audit item **D5** (three previously-failing tests): the suite is green on all six platform/Python combinations.

Note: the first YOU CI run (31b4d9225) failed on install — the hand-written package.json declared a nonexistent package version (`@radix-ui/react-dropdown-menu ^2.2.4`); fixed in f38ef3057 by using the exact dependency set the lockfile was generated from.
