# PROGRESS

Single source of truth for delivered status. Only verified work is recorded here. Newest first.

---

## 2026-10-15 — Milestones 1–2 delivered: YOU workspace foundation + multi-model chat

**Delivered (`you/` on `feat/you-workspace`, commit e629a0250):**

- Multi-user accounts: sign-up / sign-in / sign-out; scrypt password hashing (per-user salt); opaque session tokens (raw token in httpOnly cookie, only SHA-256 hash stored); 30-day sliding expiry; constant-shape sign-in errors
- Per-user tenant isolation on every query (conversations, credentials, messages)
- Encrypted BYOK credential vault: AES-256-GCM at rest; `YOU_MASTER_KEY` env (warned dev-key fallback); keys decrypted only inside the server-side gateway; API responses carry masked previews only
- Model gateway with three streaming adapter families: OpenAI-compatible (OpenAI, OpenRouter, Groq, Mistral, custom → Ollama/LM Studio/vLLM), Anthropic Messages API, Gemini `streamGenerateContent`
- Live model discovery per credential with labeled fallback catalogs
- Streaming chat (SSE): stop, regenerate, rename, auto-title, delete, per-message token usage (when the provider reports it), interruption-safe persistence (partial output saved with a note on stream failure)
- Offline demo brain — every feature usable with zero keys; demo responses always labeled
- Marketing landing page, auth view, workspace shell with progressive navigation (Chat + Models live; Agents/Work/Research/Automations/Knowledge/Skills/Integrations/Activity shown as honest roadmap panels with milestone numbers)
- Design system: warm-neutral + violet tokens, light/dark, markdown prose styles, accessible interactions, responsive to mobile (drawer nav)

**Evidence:** browser-verified end-to-end — signup, demo chat streaming + persistence + reload persistence, credential add with real provider validation round-trip (honest 403 error surfaced), models/settings views, planned views, sign-out, mobile 390px layout; ESLint clean; no console or page errors. Details in TEST_RESULTS.md.

**Not delivered (honest):** live-model streaming was not exercised against a real provider key from this environment (sandbox region is blocked by the provider — verification attempt returned a truthful 403). Adapter code paths are implemented and unit-reviewed but need a live-key integration test from an allowed region — tracked in TASKS.md. No automated test suite for `you/` yet (tracked). Agents/research/knowledge/skills/automations not started (Milestones 3–5).

**Next:** Milestone 3 scoping (agent foundation) + `you/` automated tests + CI workflow.
