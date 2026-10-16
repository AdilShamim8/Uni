# Deploying ReWoo

ReWoo ships as a single Next.js application. It deploys cleanly to **Vercel** (the primary target) and to any Node.js host or container.

---

## Vercel (recommended)

### Prerequisites

- A GitHub repository containing ReWoo (fork or push).
- A **PostgreSQL** database — the free tiers of [Neon](https://neon.tech) or [Supabase](https://supabase.com) are sufficient. (SQLite cannot be used on Vercel: serverless functions have an ephemeral, read-only filesystem.)
- A master key for the credential vault: run `openssl rand -hex 32` once and keep the output.

### Steps

1. **Create the database** (Neon or Supabase) and copy its connection string, e.g.
   `postgresql://user:password@ep-xxxx.eu-central-1.aws.neon.tech/rewoo?sslmode=require`.

2. **Import the repository on Vercel**: New Project → Import Git Repository. Vercel auto-detects Next.js; leave the build settings at their defaults.

3. **Set the environment variables** (Project → Settings → Environment Variables → Production and Preview):

   | Variable | Required | Value |
   |---|---|---|
   | `DATABASE_URL` | yes | your PostgreSQL connection string |
   | `REWOO_MASTER_KEY` | yes | 64 hex chars (`openssl rand -hex 32`) |

   > ⚠️ `REWOO_MASTER_KEY` must be set before the first user adds a provider credential — it encrypts provider API keys at rest. If it changes or is lost, stored credentials can no longer be decrypted (users must re-enter keys).

4. **Deploy.** The `postinstall` hook runs `scripts/prisma.mjs generate`, which detects the `postgresql://` URL and generates the correct Prisma client (including the `rhel-openssl-3.0.x` binary target for Vercel's runtime). No manual steps.

5. **Create the tables** — once, from your machine:

   ```bash
   git clone https://github.com/<you>/ReWoo && cd ReWoo
   bun install
   DATABASE_URL="postgresql://…" bun run db:push
   ```

6. Visit your deployment, create an account, and add a provider key in Settings → Providers.

### Vercel-specific behavior

- **Streaming**: `/api/chat` runs with `maxDuration = 60` (the Hobby-plan ceiling). Pro plans can raise it.
- **Rate limiting**: the built-in limiter is per-function-instance on serverless (each instance keeps its own counters). It still stops bursts, but for strict global quotas add a shared store (e.g. Upstash Ratelimit) in front.
- **Filesystem**: no local files are used at runtime. The dev-only master-key file path is disabled in favor of the env var — the app logs a clear warning if it is missing.

---

## Self-hosting (Docker or any Node host)

Requirements: Node.js 20+ (or Bun 1.1+), a PostgreSQL database (or SQLite for a single-user, non-clustered deployment).

```bash
git clone https://github.com/AdilShamim8/ReWoo.git && cd ReWoo
bun install                       # or npm install
cp .env.example .env              # set DATABASE_URL + REWOO_MASTER_KEY
bun run db:push                   # create tables
bun run build                     # production build
bun start                         # serve on :3000 (next start)
```

Run it behind a reverse proxy (Caddy, nginx, Traefik) that terminates TLS. Scale horizontally by pointing every instance at the same PostgreSQL database.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | `postgresql://…` (production) or `file:./db/rewoo.db` (local SQLite) |
| `REWOO_MASTER_KEY` | in production | AES-256-GCM master key for the provider vault (`openssl rand -hex 32`) |

No other variables are required. No third-party services are called except the AI providers the user configures.

---

## Verifying a deployment

- `GET /api/health` → `{"ok":true,"service":"rewoo-workspace","db":true}` (check `db: true`).
- Sign up, add a provider credential, and confirm it shows **verified**.
- Send a chat message and confirm streaming output plus token usage.
- The Models view should list live models with *flagship / fast & affordable* badges.
