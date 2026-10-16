# ReWoo Architecture

A single Next.js application, deliberately small: ~20 runtime dependencies, one database, no background workers, no engine bundles.

```
┌──────────────────────────────────────────────────────────────────┐
│ Browser (React 19, Tailwind 4, minimal shadcn/ui set)            │
│   landing · auth · workspace shell · chat · models · settings    │
│   state: zustand (workspace) + local component state             │
└───────────────┬──────────────────────────────────────────────────┘
                │ fetch + SSE (same-origin, relative paths only)
┌───────────────▼──────────────────────────────────────────────────┐
│ Next.js App Router (Node runtime)                                │
│                                                                  │
│  /api/auth/*      sign-up / sign-in / sign-out / me              │
│      └─ scrypt password hashing · opaque sessions (SHA-256 at    │
│         rest, httpOnly cookie, 30-day sliding expiry) · rate     │
│         limits per IP                                            │
│                                                                  │
│  /api/providers*  BYOK credential vault                          │
│      └─ AES-256-GCM encrypt-at-rest · live validation · masked   │
│         previews only (key material never returned)              │
│                                                                  │
│  /api/models      live model discovery per credential            │
│      └─ fetches provider /models endpoints, sorts by tier,       │
│         falls back to a labeled catalog when unreachable         │
│                                                                  │
│  /api/chat        SSE streaming pipeline                         │
│      └─ persists user message → resolves credential → streams    │
│         from provider → records usage → persists assistant       │
│         message → auto-titles the conversation; partial output   │
│         is preserved if a stream fails or is cancelled           │
│                                                                  │
│  /api/conversations*  CRUD for conversations (tenant-scoped)     │
│  /api/health          liveness + database check                  │
└───────────────┬──────────────────────────────────────────────────┘
                │
      ┌─────────▼──────────┐        ┌─────────────────────────────┐
      │ Prisma 6           │        │ Model gateway               │
      │ User · Session ·   │        │ (src/lib/providers.ts)      │
      │ ProviderCredential │        │ 3 adapter families:         │
      │ Conversation ·     │        │  OpenAI-compatible          │
      │ Message            │        │  Anthropic (v1/messages)    │
      │                    │        │  Gemini (streamGenerate)    │
      │ SQLite (dev) or    │        │ + fetchWithRetry: connect   │
      │ PostgreSQL (prod)  │        │   timeout, bounded retries, │
      └────────────────────┘        │   abort-aware              │
                                    └──────────┬──────────────────┘
                                               │ HTTPS, keys decrypted
                                               │ only inside this layer
                                    ┌──────────▼──────────────────┐
                                    │ OpenAI · Anthropic · Gemini │
                                    │ OpenRouter · Groq · Mistral │
                                    │ + any OpenAI-compatible     │
                                    │   endpoint (Ollama, vLLM…)  │
                                    └─────────────────────────────┘
```

## Core principles

1. **One model layer.** A single provider-independent gateway serves every feature. Adding a provider means one registry entry (or none — any OpenAI-compatible base URL works out of the box). No overlapping engines.

2. **Keys never touch the browser.** Credentials are encrypted (AES-256-GCM) with a master key from the environment and decrypted only inside server routes. APIs return masked previews (`sk-a•••wxyz`).

3. **Tenant isolation at the query layer.** Every lookup is scoped by the session user via `findFirst({ where: { id, userId } })`. The two-user isolation tests in `src/lib/__tests__/db-isolation.test.ts` exercise exactly these patterns.

4. **Honest capability labels.** The UI labels the demo brain and marks roadmap features as *soon*. Live model discovery never falls back silently — the fallback catalog is visibly labeled.

5. **Serverless-safe by construction.** No local filesystem at runtime, no long-lived processes, no websockets required (SSE only), streaming routes declare `maxDuration`, and the Prisma client is generated per-`DATABASE_URL` protocol.

## Data model

Five models, portable across SQLite and PostgreSQL:

- **User** — email (unique), scrypt password hash, name.
- **Session** — SHA-256 hash of the cookie token; sliding 30-day expiry; cascades with user.
- **ProviderCredential** — provider id, label, encrypted key, optional base URL, validation state; unique per (user, provider, label).
- **Conversation** — title, provider/model snapshot, pinned; indexed on (userId, updatedAt).
- **Message** — role, content, provider/model, demo flag, prompt/completion tokens; indexed on (conversationId, createdAt).

## Model tiers

`modelTier()` in the gateway classifies model IDs into *fast / balanced / powerful* using boundary-aware patterns (so `gemini` never matches `mini`). Live catalogs are sorted flagship-first and the Models view badges picks — helping users choose cheap-and-quick vs frontier quality deliberately.

## What is intentionally not here yet

Agents, tool execution, knowledge retrieval, artifacts, skills, and automations are future milestones (see docs/DECISIONS.md). They will be built on the same gateway and data model rather than as separate engines. The sidebar shows them as *soon* — honestly.

## Historical note

Before v0.3, this repository also carried a single-user Python agent application and three vendored engine trees (~1.1 GB, 73.5k files). They were removed in the v0.3 restructure (owner-approved) and remain recoverable from git history. See docs/DECISIONS.md (ADR-010…013) for the rationale.
