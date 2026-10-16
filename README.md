<div align="center">

<img src="public/logo.svg" width="88" alt="ReWoo" />

# ReWoo

### The open-source AI workspace — your keys, your models, your data.

**New in v0.4 — Local Mode:** the workspace now runs with zero configuration. No database? Chat, keys, and history live entirely in your browser. Add a Postgres URL later to unlock accounts and sync.

**Multi-user accounts · Encrypted BYOK provider vault · Live model discovery · Streaming chat with full persistence**

`Apache-2.0` · `Next.js 16` · `TypeScript` · `Deployable to Vercel in minutes`

[Quick start](#-quick-start) · [Deploy to Vercel](#-deploy-to-vercel) · [What works today](#-what-works-today) · [Architecture](docs/ARCHITECTURE.md) · [Contributing](CONTRIBUTING.md)

</div>

---

## 🟣 What is ReWoo?

ReWoo is a **premium, lightweight, open-source AI workspace**. Bring your own API keys, choose any model from any major provider, and chat with real streaming, persistence, and usage accounting — while your keys stay encrypted and your data stays yours.

- **Any brain.** OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, Mistral, or any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, internal gateways). Model lists are fetched **live** from providers — no stale hardcoded catalogs.
- **Your keys, sealed.** API keys are validated, then encrypted with **AES-256-GCM** before storage. They are decrypted only inside the server-side gateway and never returned to the browser — only a masked preview.
- **Real accounts, real isolation.** Email + password auth (scrypt-hashed), opaque httpOnly sessions, and every query scoped per user.
- **Honest software.** Roadmap features (agents, research, knowledge, automations) are labeled *“soon”* in the UI — no fake buttons, no mock AI pretending to be live. An offline **demo brain** is clearly labeled as such.
- **Lightweight by design.** ~20 runtime dependencies, one app, one database. No heavyweight engines, no model downloads, no opaque services.

## 🚀 Quick start

Requires **Node.js 20+** (or **Bun 1.1+**).

```bash
git clone https://github.com/AdilShamim8/ReWoo.git
cd ReWoo
bun install            # or: npm install — also creates the local SQLite database
bun run dev            # http://localhost:3000 — no .env copy needed
```

That's the whole setup: `bun install` auto-provisions a local SQLite database
(with schema) at `prisma/db/rewoo.db`, and a development master key is
generated on first run. To customize (PostgreSQL, persistent vault key), copy
`.env.example` to `.env` — see [Deploy to Vercel](#-deploy-to-vercel).

Sign up with any email/password (stored locally), then either:

- **Try it instantly** — chat with the clearly-labeled offline **demo brain**, or
- **Connect a provider** — Settings → Providers → Add. Paste an API key for OpenAI, Anthropic, Gemini, OpenRouter, Groq, or Mistral, or point a custom base URL at Ollama / LM Studio / vLLM. The key is validated against the provider, then encrypted before it touches disk.

| Command | Purpose |
|---|---|
| `bun run dev` | Development server |
| `bun run build` / `bun start` | Production build / serve |
| `bun run lint` / `bun run typecheck` | ESLint / TypeScript checks |
| `bun test` | Automated test suite (vault, auth, rate limits, tenant isolation, setup diagnostics…) |
| `bun run db:push` | Apply the Prisma schema (automatic for local SQLite; run once for PostgreSQL) |

## ▲ Deploy to Vercel

ReWoo is built for Vercel: serverless-safe, PostgreSQL-ready, no background workers required.

**You need:** a Vercel account · a PostgreSQL database (free tier on [Neon](https://neon.tech) or [Supabase](https://supabase.com) works) · one generated master key.

1. **Push this repo** to your GitHub (or fork it).
2. **Create a PostgreSQL database** and copy its connection string.
3. **Import the repo on Vercel** (New Project → Import). Vercel auto-detects Next.js.
4. **Set environment variables** (Project → Settings → Environment Variables):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `postgresql://…` (your Neon/Supabase/RDS URL) |
   | `REWOO_MASTER_KEY` | 64 hex chars — generate with `openssl rand -hex 32` |

5. **Deploy.** The `postinstall` hook generates the correct Prisma client for PostgreSQL automatically.
6. **Create the tables** — run once from your machine:

   ```bash
   DATABASE_URL="postgresql://…" bun run db:push
   ```

**Deployed without the env vars?** The app won't fail with cryptic errors — it
boots into a **Setup required** screen that names exactly what is missing and
the copy-paste commands to fix it (`/api/health` powers it and returns precise
diagnostics). See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) → Troubleshooting.

Full guide with screenshots, Docker/self-host alternative, and troubleshooting: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## ✅ What works today

| Area | Details |
|---|---|
| Accounts | Email + password (scrypt-hashed), opaque session cookies (SHA-256 at rest), 30-day sliding expiry |
| Isolation | Every database query is scoped by the session user; covered by automated two-user isolation tests |
| Credential vault | Keys encrypted at rest (AES-256-GCM); decrypted only inside the server-side gateway; APIs return masked previews only |
| Model discovery | Live model lists per provider, sorted with flagship models first, with a labeled fallback catalog when the provider is unreachable |
| Chat | Real SSE streaming, stop/regenerate, auto-titles, rename, delete, full persistence, per-message token usage when the provider reports it |
| Providers | OpenAI, Anthropic, Gemini, OpenRouter, Groq, Mistral, + any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM…) |
| Resilience | Provider calls have connect timeouts, bounded retries with backoff, and readable error hints (key / rate-limit / model-ID) |
| Abuse guards | Sliding-window rate limits on sign-in, sign-up, chat, and credential endpoints |
| Demo brain | Every feature works without any key; demo responses are always labeled |

**On the roadmap** (honestly labeled in the UI): agents and tool execution · deep research with citations · knowledge base and memory · skills · automations. See [docs/DECISIONS.md](docs/DECISIONS.md) for the milestone plan and the full decision history.

## 🔐 Privacy and security

- There is no ReWoo cloud and no telemetry. Your deployment is yours.
- Provider keys never reach the browser and are billed by your providers at their rates — ReWoo adds no markup.
- Secrets stay out of git (`.env` is ignored; see `.env.example` for every variable).
- Security issues: see [SECURITY.md](SECURITY.md) for how to report them responsibly.

## 🛠️ Architecture (short version)

- **Next.js 16 App Router + TypeScript + Tailwind CSS 4** with a minimal shadcn/ui component set.
- **Prisma ORM** — SQLite for zero-setup local dev, PostgreSQL for production; the same portable data model.
- **Server-side model gateway** (`src/lib/providers.ts`) — three streaming adapter families (OpenAI-compatible, Anthropic, Gemini); keys never leave the server.
- **SSE chat pipeline** (`src/app/api/chat/route.ts`) — persists the user message, streams the assistant response, records usage, and preserves partial output if a stream is interrupted.

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Decision records: [docs/DECISIONS.md](docs/DECISIONS.md)

## 📜 License and credits

ReWoo is **Apache-2.0** ([LICENSE](LICENSE), [NOTICE](NOTICE)). UI components build on shadcn/ui (MIT). Historical attribution for ideas studied during early development: [ATTRIBUTION.md](ATTRIBUTION.md). The ReWoo name, logo, and visual design are original — see [TRADEMARKS.md](TRADEMARKS.md).

> ReWoo is a young open-source project (v0.3). It has not been audited for high-stakes use — please don't rely on it for medical, legal, or financial decisions.

**Author:** [Adil Shamim](https://adilshamim.me) · [GitHub](https://github.com/AdilShamim8) · [LinkedIn](https://linkedin.com/in/adilshamim8)
