# Defect Register — ReWoo

**Source of truth for known defects and their resolution state.** Derived from `BUGS_AND_ISSUES.md` (v0.2 survey), `docs/engineering/CURRENT_STATE_AUDIT.md` (Phase Zero audit, 2026-10-15), CI evidence on `main`, and the 2026-10-15 rebrand verification session. Ranked by severity. Each entry carries a decision: **preserve / refactor / replace / remove** for the affected subsystem.

Legend — Status: **OPEN** (unverified or unfixed) · **FIXED-VERIFIED** (fix observed running in CI or browser evidence) · **FIXED-CLAIMED** (fix committed, regression test missing) · **CLOSED** (verified with test evidence).

---

## Register

| ID | Severity | Defect | Location | Status | Evidence / next action |
|----|----------|--------|----------|--------|------------------------|
| D2 | High (security) | SSRF bypass via open HTTP redirects in `web_fetch` | `rewoo/tools/builtin.py` | FIXED-CLAIMED | Fix in 3a1ee423; needs redirect-following regression test |
| D3 | High (security) | Arbitrary static file exposure via path traversal | `rewoo/api/app.py` | FIXED-CLAIMED | Guard present (`resolve()` + parents check); needs Windows/UNC regression test |
| D4 | High (repo health) | ~292 MB / 73.5k vendored files under `engines/` | `engines/` | OPEN | Clone/CI cost severe. All MIT (legal). Extraction requires owner sign-off (ADR-007) — see REPOSITORY_CLEANUP_PLAN |
| D6 | Medium | Non-atomic EventBus sequence + cross-thread `Queue.put_nowait` | `rewoo/events.py` | FIXED-CLAIMED | Fix in 3a1ee423; needs race-condition tests |
| D7 | Medium | OAuth state map unbounded growth | `rewoo/connectors/gdrive.py` | OPEN | Add TTL/expiry sweep |
| D8 | Medium | SSE disconnection detection blocked | `rewoo/api/routes_core.py` | OPEN | Add heartbeat/timeout |
| D9 | Medium | O(N) embedding scan in memory store | `rewoo/memory/store.py` | OPEN | Fine at personal scale; blocks hosted scale |
| D10 | Medium | DOM keydown listener leaks in modals | `web/src/components/ui` | OPEN | Frontend superseded by the ReWoo workspace; fix if `web/` remains in service |
| D12 | Low | `pypdf` vs `PyPDF2` silent PDF ingestion failure | requirements vs code | FIXED-CLAIMED | Pinned in 3a1ee423; needs ingestion test |
| D11 | Low | Deprecated `@app.on_event` / `get_event_loop()` remnants | `rewoo/api/app.py` | FIXED-CLAIMED | Largely migrated to lifespan pattern; finish removal |
| D13 | Low (hygiene) | Prebuilt `rewoo/web/dist` committed to tree | `rewoo/web/dist` | OPEN-BY-DESIGN | Supports "Python only, no Node" install promise; documented trade-off |
| D14 | Low (hygiene) | Non-descriptive commit messages in history | git history | CLOSED | Conventional commits adopted since c270e574d; rule in AGENTS.md |
| D15 | Medium (product) | **Placeholder "YOU" branding** across the workspace app: page metadata, wordmark, landing copy, system prompt, OpenRouter referer headers, env var `YOU_MASTER_KEY`, internal module names (`you-client`, `you-store`, `components/you/`), CSS utilities (`you-scroll`, `you-prose`), CI workflow name, health `service` label | `you/` (workspace app) | **FIXED-VERIFIED (2026-10-15, this branch)** | Master-prompt requirement. Verified: `grep` for `YOU` in `you/src` returns only intentional KDF-compat constants; browser + VLM screenshot evidence across landing/auth/workspace/settings/mobile shows "ReWoo" wordmark and zero "YOU" product branding; lint/typecheck/build green. Env var renamed with backward-compatible fallback (`REWOO_MASTER_KEY` ?? `YOU_MASTER_KEY`); dev key file `.you-master-key` auto-migrates to `.rewoo-master-key`; KDF salts unchanged so existing ciphertexts still decrypt |
| D16 | Low (hygiene) | Workspace directory still named `you/` (historical scaffold name) | repo root | OPEN — planned | Not product-facing; rename to `apps/workspace` scheduled in REPOSITORY_CLEANUP_PLAN C-3 with ADR amendment |
| D17 | Low (tooling) | `bun.lock` workspace `name` field says `nextjs_tailwind_shadcn_ts` (stale scaffold name) | `you/bun.lock` | OPEN — cosmetic | Bun validates dependency resolution, not the name; rename happens naturally on the next `bun install` regenerating the lockfile |
| D18 | Medium (quality) | No automated test suite for the workspace app (auth flows, vault round-trip, adapter fixtures, two-user isolation) | `you/` | OPEN | Tracked as T16 in `context/TASKS.md`; highest-value next quality increment |
| D19 | Low (observability) | Health endpoint exposed `db:false` while DB reachable when an inherited `DATABASE_URL` env overrides the app `.env` | environment behavior, not code | CLOSED (not a code defect) | Root-caused during verification: shell-exported `DATABASE_URL` takes precedence over `.env` (standard Next.js behavior). Documented in you/README self-hosting notes |

Closed items kept for history:

| ID | Severity | Defect | Status | Evidence |
|----|----------|--------|--------|----------|
| D5 | High (quality) | 3 failing tests (SQLite Windows lock, asyncio wait_for deadlock, console UnicodeEncodeError) | CLOSED | CI verified 2026-10-15, pytest + eval green on ubuntu/windows/macos × Py 3.9/3.12, f38ef3057 |
| D1 | — | Initial Phase Zero audit gaps (no defect register / cleanup plan / reuse register files) | CLOSED | Created 2026-10-15: this file, REPOSITORY_CLEANUP_PLAN.md, docs/research/OPEN_SOURCE_REUSE_REGISTER.md |

---

## Security review notes (workspace app, 2026-10-15)

- Provider keys: AES-256-GCM at rest, decrypted only server-side in the gateway, masked previews only in API responses — preserved through the rename; KDF parameters deliberately unchanged.
- Sessions: opaque tokens, SHA-256 at rest, httpOnly cookies, 30-day sliding expiry, constant-shape auth errors.
- Tenant isolation: every query scoped by session user.
- No secrets in the rebrand diff (verified by `git diff` review before commit).
- Remaining open security items are all on the Python engine side (D2, D3 regression tests; D7).
