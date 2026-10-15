# ReWoo Workspace

The multi-user, TypeScript-first AI workspace of the [ReWoo](../README.md) project — the product's primary web surface. Open source under Apache-2.0 (see the repository root license).

> **Directory note:** this app lives in `you/` for historical reasons (the pre-rebrand scaffold name). The product identity is **ReWoo** everywhere users can see it; the directory rename to `app/` is tracked in `../docs/engineering/REPOSITORY_CLEANUP_PLAN.md`.

**Status: Milestones 1–2 (foundation + multi-model chat).** Verified working: multi-user accounts, encrypted BYOK provider vault, live model discovery, streaming chat with persistence, and an offline demo brain. Agents, research, knowledge, skills, and automations are on the roadmap (see `../context/IMPLEMENTATION_ROADMAP.md`) and are honestly labeled as such in the UI — no fake features.

## Quick start

Requires Node.js 20+ (or Bun 1.1+) and an SQLite-capable system (default dev database).

```bash
cd you
npm install            # or: bun install
cp .env.example .env   # defaults work for local development
npm run db:push        # create the SQLite schema
npm run dev            # http://localhost:3000
```

Sign up with any email/password (stored locally), then either:

- **Try it instantly** — chat with the clearly-labeled offline **demo brain**, or
- **Connect a provider** — Settings → Providers → Add. Paste an API key for OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, or Mistral, or point a custom OpenAI-compatible base URL at Ollama / LM Studio / vLLM. The key is validated against the provider, then encrypted (AES-256-GCM) before storage.

## What works in this milestone

| Area | Details |
|---|---|
| Accounts | Email + password (scrypt-hashed), opaque session cookies (SHA-256 at rest), 30-day sliding expiry |
| Isolation | Every database query is scoped by the session user; conversations and credentials are per-user |
| Credential vault | Keys encrypted at rest; decrypted only inside the server-side gateway; APIs return masked previews only |
| Model discovery | Live model lists per provider (with a labeled fallback catalog when the provider list endpoint is unreachable) |
| Chat | Real SSE streaming, stop/regenerate, auto-titles, rename, delete, full persistence, per-message token usage when the provider reports it |
| Providers | OpenAI, Anthropic, Gemini, OpenRouter, Groq, Mistral, + any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM…) |
| Demo brain | Every feature works without any key; demo responses are always labeled |

## Architecture (short version)

- **Next.js App Router + TypeScript + Tailwind CSS 4** with a shadcn/ui-style component base.
- **Prisma ORM** — SQLite in dev, schema written PostgreSQL-portably for hosted deployments. Models: `User`, `Session`, `ProviderCredential`, `Conversation`, `Message`.
- **Server-side model gateway** (`src/lib/providers.ts`) — three streaming adapter families (OpenAI-compatible, Anthropic, Gemini); keys never reach the browser.
- **SSE chat pipeline** (`src/app/api/chat/route.ts`) — persists the user message, streams the assistant response, records usage, and preserves partial output if a stream is interrupted.

Full context: `../context/TARGET_ARCHITECTURE.md` and `../docs/engineering/CURRENT_STATE_AUDIT.md`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript checks |
| `npm run db:push` | Apply the Prisma schema to the database |

## Self-hosting notes

- Set `REWOO_MASTER_KEY` (64 hex chars, `openssl rand -hex 32`) before exposing the app beyond localhost — otherwise a development key file is auto-generated and flagged in the console. (The pre-rebrand `YOU_MASTER_KEY` variable is still honored, and a legacy `.you-master-key` dev file is migrated automatically.)
- For PostgreSQL, change the `datasource` in `prisma/schema.prisma` and set `DATABASE_URL` accordingly.
- Provider usage costs are billed by your chosen providers at their rates; ReWoo adds no markup.

## Relationship to the Python app

The existing Python application (`../rewoo/`) is preserved untouched and remains the self-hosted single-user engine. This workspace is additive; see `../context/DECISIONS.md` (ADR-001, ADR-002) for the migration strategy.
