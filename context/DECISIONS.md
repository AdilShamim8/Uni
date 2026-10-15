# DECISIONS

Architecture Decision Records (condensed). Newest last.

## ADR-001 — Preserve the Python agent core
**Decision:** Do not rewrite `rewoo/` Python runtime to TypeScript. **Reason:** working, tested, backed by the 36-repo research survey. TypeScript-first applies to the new workspace application layer (then named “YOU”; rebranded to ReWoo by ADR-009), not to a blind rewrite. **Consequence:** two runtimes coexist behind clear boundaries.

## ADR-002 — The workspace app lives in `you/`, additive only

> *Renamed 2026-10-15 (ADR-009): the app's product identity is **ReWoo**; “YOU” below reflects the pre-rebrand name. Directory unchanged pending cleanup plan C-3.*
**Decision:** The Next.js application is added at `you/`; no existing paths are modified or deleted during foundation milestones. **Reason:** zero-risk integration; preserves all working functionality per Phase Zero audit. **Consequence:** `web/` (Vite app) remains until YOU reaches parity, then retires via owner-approved PR.

## ADR-003 — First-party auth, not OAuth-only
**Decision:** Email + password credentials with hashed storage and opaque server-side sessions, designed so an external IdP can be added later. **Reason:** the vision requires real multi-user accounts; simplest correct foundation. **Consequence:** we own credential security (hashing, rate limiting, rotation).

## ADR-004 — Provider keys encrypted at rest (AES-256-GCM)
**Decision:** BYOK keys are stored ciphertext; decryption happens only inside the server-side gateway process; APIs never return key material (masked preview only). **Reason:** Phase Four security requirements. **Consequence:** master key management documented for self-hosters (`YOU_MASTER_KEY` env; auto-generated dev key with warning).

## ADR-005 — OpenAI-compatible custom endpoints as the extensibility default
**Decision:** Beyond the six named providers, any OpenAI-compatible base URL is a first-class provider. **Reason:** covers Ollama, LM Studio, vLLM, OpenRouter-style gateways without bespoke adapters. **Consequence:** capability detection per provider (vision/tools/streaming) with graceful degradation.

## ADR-006 — No hardcoded model catalogs
**Decision:** Model lists are fetched live from provider APIs where available, with a small fallback catalog only for offline demo mode. **Reason:** Phase Four explicitly forbids permanent hardcoded model lists. **Consequence:** provider capability surface must be cached defensively.

## ADR-007 — Engines extraction requires owner sign-off
**Decision:** The 73.5k-file vendored `engines/` trees stay untouched until the owner approves an extraction plan (submodules or fetched packages). **Reason:** Phase Zero audit D4; deletion/extraction is destructive to history and workflows. **Consequence:** repo remains heavy in the interim; documented as known issue.

## ADR-008 — Honest status tracking
**Decision:** Every context document separates *vision* from *delivered*. Feature status lives in FEATURE_MATRIX.md with only verified items marked done. **Reason:** the master prompt forbids aspirational docs posing as delivered functionality. **Consequence:** PROGRESS.md is the single source of truth for what works.

## ADR-009 — Single product identity: ReWoo everywhere (retire the "YOU" placeholder)
**Decision:** The workspace app adopts the ReWoo name in every product-facing surface — page metadata, wordmark, landing copy, system prompt, provider headers, docs, CI naming, health label. Internal module names follow (`rewoo-client`, `rewoo-store`, `components/rewoo/`, `rewoo-*` CSS utilities). **Backward compatibility:** `YOU_MASTER_KEY` env still honored, `.you-master-key` dev file auto-migrates, and vault KDF parameters are unchanged so pre-rebrand ciphertexts keep decrypting. **Reason:** master engineering prompt non-negotiable "Product identity"; one product, one name. **Consequence:** the `you/` directory name remains temporarily (developer-facing only; rename scheduled in REPOSITORY_CLEANUP_PLAN C-3 to limit blast radius of this increment); legacy compat shims tracked for removal after a release cycle.

## ADR-010 — Open-source reuse gate: permissive licenses only, per-project strategy
**Decision:** Code reuse restricted to MIT/Apache-2.0 projects (verified via GitHub API): LibreChat (MIT) and OpenMausBot (Apache-2.0) are approved candidates; open-dot and open-dots (no license) and open-webui / lobehub (custom restrictive licenses) are barred from code copying. **Reason:** master prompt §6 licensing rules; unlicensed = all-rights-reserved; custom licenses carry distribution conditions incompatible with an Apache-2.0 redistribution product. **Consequence:** full verdicts and obligations recorded in docs/research/OPEN_SOURCE_REUSE_REGISTER.md; vendor/port decisions for Milestone-3 agent foundation start from LibreChat/OpenMausBot modules.
