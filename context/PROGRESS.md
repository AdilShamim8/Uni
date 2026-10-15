# PROGRESS

Single source of truth for delivered status. Only verified work is recorded here. Newest first.

---

## 2026-10-15 — Increment: single product identity (YOU → ReWoo) + Phase Zero docs completed

**Delivered (branch `feat/rewoo-rebrand`):**

- Product-facing rebrand of the workspace app to **ReWoo**: page metadata/title, wordmark (R mark + "ReWoo"), landing copy, Settings About, chat system prompt, OpenRouter attribution headers (`X-Title: ReWoo Workspace`, referer `https://rewoo.tech`), health `service` label, package name, README, `.env.example`, CI workflow name
- Internal renames with zero functional change: `you-client.ts`→`rewoo-client.ts`, `you-store.ts`→`rewoo-store.ts`, `components/you/`→`components/rewoo/`, `useYou`→`useReWoo`, CSS utilities `you-*`→`rewoo-*`, a11y ids `you-*`→`rewoo-*`
- Vault compatibility preserved: `REWOO_MASTER_KEY` ?? legacy `YOU_MASTER_KEY`; `.you-master-key` dev file auto-migrates to `.rewoo-master-key`; KDF salts unchanged (pre-rebrand ciphertexts decrypt — verified by round-trip during session)
- Phase Zero documentation completed: `docs/engineering/DEFECT_REGISTER.md` (D1–D19 with statuses), `docs/engineering/REPOSITORY_CLEANUP_PLAN.md` (C-0 done, C-2..C-7 queued), `docs/research/OPEN_SOURCE_REUSE_REGISTER.md` (licenses verified via GitHub API for all six prompt-named projects + vendored trees)
- ADR-009 (product identity) and ADR-010 (reuse gate) recorded

**Evidence:** `bun install` (lockfile untouched → CI frozen-lockfile safe), `prisma generate`, `eslint .` clean, `tsc --noEmit` clean, `next build` green (14 routes); production server (`next start`) + automated browser session: landing / auth / signup / workspace / demo-brain streaming chat / reload persistence / conversation reopen / Models / Settings→About / mobile 390px drawer — all ReWoo-branded, zero "YOU" product strings in DOM (`document.body.innerText` scan), no console or page errors; VLM screenshot review confirms wordmark, layout integrity, and no visual defects. Details in TEST_RESULTS.md.

**Not delivered (honest):** `you/` directory rename deferred to cleanup plan C-3 (needs ADR-002 amendment); automated test suite for the workspace still open (T16/D18); live-key provider streaming still unverified from this region (T14).

**Next:** T16 automated tests → T18/T19 (message branching, attachments — port patterns from LibreChat per ADR-010) → Milestone 3 agent foundation scoping.

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
