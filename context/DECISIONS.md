# DECISIONS

Architecture Decision Records (condensed). Newest last.

## ADR-001 — Preserve the Python agent core
**Decision:** Do not rewrite `rewoo/` Python runtime to TypeScript. **Reason:** working, tested, backed by the 36-repo research survey. TypeScript-first applies to the new YOU application layer, not to a blind rewrite. **Consequence:** two runtimes coexist behind clear boundaries.

## ADR-002 — YOU app lives in `you/`, additive only
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
