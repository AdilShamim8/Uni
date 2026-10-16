# Defect Register — ReWoo

**Source of truth for known defects and their resolution state.** Ranked by severity. Entries marked CLOSED/RESOLVED are kept for history. Pre-restructure items about the retired Python app are preserved verbatim below the line.

> **2026-10-16 v0.3.1 update:** D22 (silent serverless misconfiguration), D23 (duplicated assistant message on abort), and D24 (guards rethrowing non-auth errors as HTML 500s) found during post-deploy verification of re-woo-two.vercel.app and **FIXED-VERIFIED** — see the current register below.

Legend — Status: **OPEN** (unverified or unfixed) · **FIXED-VERIFIED** (fix observed running in CI or browser evidence) · **FIXED-CLAIMED** (fix committed, regression test missing) · **CLOSED** (verified with test evidence).

---

## Register (current)

| ID | Severity | Defect | Location | Status | Evidence / next action |
|----|----------|--------|----------|--------|------------------------|
| D22 | High (deployment) | A Vercel deploy without `DATABASE_URL` (or with SQLite) failed every DB call on the read-only filesystem — auth returned opaque `500 "Try again"`, health lied `ok:true, db:false`, and nothing told the operator what to do (observed live on re-woo-two.vercel.app, 2026-10-16) | `src/lib/setup.ts`, `src/app/api/*`, `src/components/rewoo/setup-view.tsx` | **FIXED-VERIFIED (v0.3.1)** | Health returns 503 + classified `dbIssue`; all DB routes return `503 setup_required`; client boots into a Setup required screen with exact fix commands; build-time warnings on Vercel. Verified locally across 4 failure scenarios (read-only FS, unreachable Postgres, client/URL mismatch, empty schema) + headless-browser screenshots (light/dark) |
| D23 | Medium (correctness) | Pressing Stop / client disconnect as a turn completed persisted the assistant message **twice** (normal save + interrupt save) | `src/app/api/chat/route.ts` | **FIXED-VERIFIED (v0.3.1)** | `assistantPersisted` guard; reproduced the abort with a truncating stream reader pre-fix (2 assistant rows), re-ran post-fix (1 row, `NO DUPLICATES`) |
| D24 | Low (API hygiene) | `guard()` in six API routes rethrew non-Unauthorized errors → unhandled → Next.js HTML 500 pages instead of JSON; clients could only show "Request failed (500)" | `src/app/api/**/route.ts` | **FIXED-VERIFIED (v0.3.1)** | All guards return structured JSON (503 setup / 500 app) with route-tagged logs |
| D21 | Low (observability) | In-memory rate limiting is per-instance on serverless | `src/lib/rate-limit.ts` | OPEN (documented) | Acceptable for bursts; strict global quotas need Vercel WAF / Upstash in front — documented in DEPLOYMENT.md |

---

## Historical register (pre-restructure, retired app)

| ID | Severity | Defect | Location | Status | Evidence / next action |
|----|----------|--------|----------|--------|------------------------|
| D2 | High (security) | SSRF bypass via open HTTP redirects in `web_fetch` | `rewoo/tools/builtin.py` | FIXED-CLAIMED | Fix in 3a1ee423; needs redirect-following regression test |
| D3 | High (security) | Arbitrary static file exposure via path traversal | `rewoo/api/app.py` | FIXED-CLAIMED | Guard present (`resolve()` + parents check); needs Windows/UNC regression test |
| D4 | High (repo health) | ~292 MB / 73.5k vendored files under `engines/` | `engines/` | **RESOLVED (v0.3)** | Owner-authorized removal (ADR-010); ~99% repository size reduction |
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
| D16 | Low (hygiene) | Workspace directory still named `you/` (historical scaffold name) | repo root | **RESOLVED (v0.3)** | Promoted to repo root (ADR-011) |
| D17 | Low (tooling) | `bun.lock` workspace `name` field says `nextjs_tailwind_shadcn_ts` (stale scaffold name) | `you/bun.lock` | **RESOLVED (v0.3)** | Lockfile regenerated with the dependency diet (ADR-013) |
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
