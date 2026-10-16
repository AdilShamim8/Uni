# Decision Records — ReWoo

Architecture Decision Records, newest last. ADRs 001–009 predate the v0.3 restructure (originally in `context/DECISIONS.md`); 010–013 record the restructure itself.

## ADR-001 — Preserve the Python agent core *(superseded by ADR-010)*
**Decision:** Do not rewrite the `rewoo/` Python runtime to TypeScript. **Reason:** it worked, was tested, and was backed by a 36-repo research survey. **Consequence:** two runtimes coexisted behind clear boundaries.

## ADR-002 — The workspace app lives in `you/`, additive only *(superseded by ADR-011)*
**Decision:** The Next.js workspace was added at `you/` without touching existing paths. **Reason:** zero-risk integration. **Consequence:** the legacy Vite frontend stayed until parity.

## ADR-003 — First-party auth, not OAuth-only
**Decision:** Email + password credentials with scrypt hashing and opaque server-side sessions. **Reason:** the product needs real multi-user accounts with the simplest correct foundation. **Consequence:** we own credential security (hashing, rate limiting, rotation). Status: in force; rate limits added in v0.3.

## ADR-004 — Provider keys encrypted at rest (AES-256-GCM)
**Decision:** BYOK keys are stored ciphertext; decryption happens only inside the server-side gateway; APIs never return key material. **Reason:** core trust promise. **Consequence:** master key management is documented for self-hosters (`REWOO_MASTER_KEY` env; auto-generated dev key with warning). Status: in force.

## ADR-005 — OpenAI-compatible custom endpoints as the extensibility default
**Decision:** Any OpenAI-compatible base URL is a first-class provider. **Reason:** covers Ollama, LM Studio, vLLM and gateways without bespoke adapters. **Consequence:** capability detection per provider with graceful degradation. Status: in force.

## ADR-006 — No hardcoded model catalogs
**Decision:** Model lists are fetched live, with a small labeled fallback only when the provider is unreachable. **Reason:** stale catalogs erode trust. **Consequence:** fallback state is surfaced to the UI. Status: in force; v0.3 adds tier sorting and fast/flagship badges.

## ADR-007 — Engines extraction requires owner sign-off *(resolved by ADR-010)*
**Decision:** The 73.5k-file vendored `engines/` trees stayed untouched pending owner approval. **Reason:** destructive to history and workflows without sign-off. **Consequence:** the repo stayed heavy in the interim.

## ADR-008 — Honest status tracking
**Decision:** Docs separate *vision* from *delivered*; roadmap features are labeled in the UI. **Reason:** aspirational docs posing as shipped functionality are a trust failure. **Consequence:** status vocabulary in docs and the *soon* badges in the sidebar. Status: in force.

## ADR-009 — Single product identity: ReWoo everywhere
**Decision:** The workspace adopted the ReWoo name on every product-facing surface; internal modules renamed (`rewoo-client`, `rewoo-store`, `components/rewoo/`). **Backward compat:** `YOU_MASTER_KEY` fallback and dev-key-file migration retained for pre-rebrand self-hosters. Status: in force; v0.3 completes it (session cookie `you_session` → `rewoo_session`, directory promotion in ADR-011).

## ADR-010 — Remove the vendored engines and retire the legacy Python app
**Date:** 2026-10-16 (v0.3 restructure) · **Supersedes:** ADR-001, ADR-002 (partially), resolves ADR-007 and defect D4
**Decision:** Owner-authorized extraction: delete `engines/` (73,538 files, ~1.1 GB: openclaw, hermes-agent, paperclip), the legacy Python app (`rewoo/`, `web/`, `tests/`, `examples/`, `scripts/`), and Python packaging configs from mainline. **Reason:** the engines were not imported by the workspace, duplicated the workspace's model layer, and made clones/CI severe (~292 MB minimum, 99.6% of files); the master prompt consolidates on one clean model layer; Vercel deployment is impossible with the legacy weight. **Consequences:** repository size drops ~99%; history preserved (recoverable via git); MIT notices retained in THIRD_PARTY_NOTICES.md for historical releases. The Python app remains available at tag/commit history for anyone self-hosting it.

## ADR-011 — Single-app repository at the root
**Date:** 2026-10-16 · **Resolves:** D16
**Decision:** Promote the workspace (formerly `you/`) to the repository root — `src/`, `prisma/`, `public/`, configs at top level; a single CI workflow. **Reason:** one product, one deployable, the layout production open-source Next.js products use; eliminates the last placeholder name. **Consequences:** Vercel import works with zero configuration; old workspace paths in issues/PRs map mechanically (`you/src` → `src`).

## ADR-012 — Dual Prisma schemas: PostgreSQL default, SQLite for dev
**Date:** 2026-10-16
**Decision:** Two schema files sharing one portable data model: `prisma/schema.prisma` (PostgreSQL, production default, `rhel-openssl-3.0.x` binary target) and `prisma/schema.sqlite.prisma` (SQLite, zero-setup dev). `scripts/prisma.mjs` selects by `DATABASE_URL` protocol and is wired into `db:*` scripts + `postinstall`. **Reason:** serverless filesystems cannot host SQLite; local dev must stay zero-setup. **Consequences:** schema changes must be applied to both files (documented in each); hosted installs generate the correct client automatically.

## ADR-013 — Dependency diet and one resilient model gateway
**Date:** 2026-10-16 · **Resolves:** D17, D18 (tests added same release)
**Decision:** Remove ~40 unused dependencies and 39 of 46 vendored UI components (827 → 524 packages installed). Harden the single gateway with `fetchWithRetry` (connect timeout, bounded backoff on 408/409/429/5xx, never retrying user cancels or started streams). Add sliding-window rate limits (sign-in 10/min/IP, sign-up 5/min/IP, chat 30/min/user, credential creation 10/min/user). Add a bun:test suite (31 tests) wired into CI. **Reason:** master prompt §3/§7/§8 — lightweight, secure, tested; smaller trees are auditable and deploy faster. **Consequences:** the suite caught a real tier-classification bug before release (see D20); in-memory rate limiting is per-instance on serverless (documented).

---

## Milestone plan (carried forward from the pre-restructure roadmap)

- **M1–M2 — Foundation + multi-model chat** ✅ (accounts, vault, discovery, streaming, demo brain)
- **M3 — Agent foundation:** durable agent runs, tool execution within permission sets, execution timelines, approval checkpoints
- **M4 — Advanced workspace:** deep research with citations, knowledge base + memory, artifacts, skills
- **M5 — Persistent automation:** scheduling, background jobs, notifications
- **M6+ — hardening & community release:** security verification, load testing, contributor readiness

Reuse note (from the pre-restructure survey): code reuse restricted to MIT/Apache-2.0 projects; LibreChat (MIT) and OpenMausBot (Apache-2.0) remain approved candidates for M3 module inspiration; unlicensed or custom-licensed projects are barred from code copying (full verdicts in docs/research/OPEN_SOURCE_REUSE_REGISTER.md).
