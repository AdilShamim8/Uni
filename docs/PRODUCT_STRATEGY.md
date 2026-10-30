# PRODUCT_STRATEGY.md — where Uni stands, what users love elsewhere, and the plan

Written 30 October 2026, after the provider-freedom wave and today's
PWA + agent-templates ship. Companion to `docs/PROJECT_CONTEXT.md`
(product truth) and `docs/backend-roadmap.md` (backend gates).

---

## 1 · Mission

**Premium AI capability, free, worldwide — honestly.** Uni's answer to
"ChatGPT premium for everyone" is not a leaked key or a proxy of someone
else's subscription: it is a **$0, MIT-licensed workspace** where anyone,
anywhere, brings their own model connection. The free path is real and
getting better every release:

- **Free-tier providers** (Groq, Google AI Studio, Mistral, GitHub
  Models, HuggingFace Router, Cerebras, NVIDIA NIM) cost $0.
- **OpenRouter `:free` models** rotate continuously at $0.
- **Local models** (Ollama / LM Studio) run offline at $0.
- Uni itself locks **nothing** behind a paywall — every feature ships to
  everyone.

That is the sustainable version of "premium for free": the interface is
free forever; the intelligence comes from providers competing to give
capacity away — and Uni makes all of them one tap away.

## 2 · What we audited today (30 Oct 2026)

| Area | State |
| --- | --- |
| CI | **Green** — fixed the jsdom 30 → undici 8 crash by moving workflows to Node 22 LTS (both `CI` and `Frontend CI` passing) |
| Tests | 359 frontend (339 + 20 new: 5 PWA + 5 templates + 10 portability) + 117 backend, all passing |
| Frontend | React 18 + Vite + TS, 5 destinations, BYOK streaming, demo mode, dark theme, mobile-first |
| Backend | B00–B04 complete (auth, conversations, providers, runs, employees, library); B05–B08 not started |
| Docs | Beginner README with a screenshot-guided tour (this wave), honest per-provider guides |
| Distribution | Vercel deployment + **new PWA** (installable, offline shell) |
| Onboarding | 21 provider presets with FREE badges + **new** 8 one-tap agent templates |
| Shareability | **New** portable agent profiles — export/import `.agent.json` (Wave 2 / S1 ✅ shipped same day) |

## 3 · What users love in the highest-starred projects

Research summary (public comparisons and reviews, Oct 2026):

| Project (stars, publicly reported) | What people love | Uni status |
| --- | --- | --- |
| **Open WebUI** (~140k) | Local-first + Ollama; **document chat / knowledge base (RAG)**; simple model management; big community | Local models ✅; RAG ❌ (Documents plugin is basic); community 🔨 |
| **LobeChat** (~70k) | **Agent marketplace** (one-tap agents); **PWA**; polished design; many models built in | Agent templates ✅ (shipped today); PWA ✅ (shipped today); presets ✅ |
| **LibreChat** (~25k+) | Multi-provider flexibility; presets; multi-user | Multi-provider ✅; presets ✅; multi-user ✅ (backend B02) |
| **big-AGI** (~15k) | Branching UX, power-user flow | Branching ✅ (tree + variants) |

**Conclusion:** Uni already matches or beats the loved features of these
projects in chat UX, provider freedom, and honesty. The two biggest gaps:

1. **Document chat / knowledge base (RAG)** — the single most-requested
   capability across all competitors. Uni's Documents plugin handles
   attachments, but there is no persistent, searchable knowledge base
   that chats and agents can draw on.
2. **Community flywheel** — marketplaces and galleries create
   shareability and contribution pull (agents, prompts, presets).

## 4 · What we shipped today (copy-paste, adapted honestly)

1. **PWA support** — manifest, icon set, service worker (network-first
   navigations, stale-while-revalidate static, **never** touching BYOK
   provider traffic). Uni now installs to home screens like the
   top-rated apps. (5 tests.)
2. **Agent templates** — 8 one-tap builder templates (Deep Researcher,
   Code Partner, Editor, Study Coach, Data Analyst, Brainstorm Partner,
   Daily Planner, Language Tutor). The marketplace pattern without the
   marketplace: curated, local, editable, provider-agnostic. (5 tests.)
3. **Beginner-first README** — a screenshot-guided 60-second tour of all
   five destinations and the provider setup flow.
4. **CI on Node 22 LTS** — unblocked the dependency line (jsdom 30,
   undici 8) so dependabot bumps keep landing green.

## 5 · Future plan (ordered by user value ÷ effort)

### Wave 1 — Knowledge base / RAG (the Open WebUI draw) 🎯
- **K1.** Ingest documents (PDF/MD/TXT/DOCX) into a workspace library
  with chunking + embeddings (local embedding via transformers.js first;
  provider embeddings optional).
- **K2.** Retrieval into chat: an explicit `@library` context source —
  same honesty rules as today's context features (citations, no silent
  retrieval).
- **K3.** Agents and Work tasks draw on the same library through the
  existing Library + plugins grant model.
- Server mode persists vectors in PostgreSQL (pgvector); local mode
  keeps an on-device index.

### Wave 2 — Shareability flywheel (the LobeChat draw)
- **S1.** ✅ *Shipped 30 Oct 2026* — export/import agent profiles as
  portable JSON (`uni.agent/v1`, persona-only, defensive import).
- **S2.** A curated community gallery file in-repo
  (`gallery/agents/*.json`) that ships with the app as an offline
  catalog; contributions via pull request.
- **S3.** Conversation-share exports (static HTML/Markdown).

### Wave 3 — Backend gates B05–B08 (from backend-roadmap.md)
- **B05** server-side plugins with enforced grants; **B06** durable Work
  (pg-boss); **B07** file ingestion + export/import completeness;
  **B08** deployment, security verification, handoff.

### Wave 4 — Reach
- **R1.** One-command Docker image for the full stack (frontend +
  backend + PostgreSQL) — the self-hosting audience is the same
  audience that stars Open WebUI.
- **R2.** i18n scaffold (the "worldwide" in the mission): start with
  the strings inventory and 2 locales.
- **R3.** Star-history / awesome-list submission once Wave 1 lands —
  the README tour + honest free path is the pitch.

## 6 · What we will not do (honesty guardrails)

- No "free premium accounts" of any provider — never resell, proxy, or
  pool credentials; BYOK only.
- No unlabeled simulation: demo mode stays clearly labeled.
- No telemetry by default; no accounts for local mode.
- No feature paywalls — if it ships, it ships to everyone.

---

*Update this file whenever a wave lands. Owner of truth for backend
gates remains `docs/backend-roadmap.md`.*
