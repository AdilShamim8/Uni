# Contributing to ReWoo

Thanks for helping! ReWoo aims to be a premium, lightweight, honest open-source AI workspace — and one of the most readable codebases in the space.

## Setup

```bash
git clone https://github.com/AdilShamim8/Universe.git && cd Universe
bun install            # or: npm install
cp .env.example .env   # defaults work for local development
bun run db:push        # create the SQLite schema
bun run dev            # http://localhost:3000
```

Before opening a PR, run the full gate locally — CI runs exactly these:

```bash
bun run lint           # ESLint
bun run typecheck      # TypeScript
bun test               # automated suite (vault, auth, rate limits, tenant isolation)
bun run build          # production build
```

## Where things live

| Path | Contents |
|---|---|
| `src/app/` | Routes: pages + API handlers (auth, providers, models, chat, conversations, health) |
| `src/components/rewoo/` | Product UI (landing, auth, workspace, chat, models, settings) |
| `src/components/ui/` | The minimal shadcn/ui set actually used (9 components) |
| `src/lib/` | Core: auth (scrypt + sessions), crypto (AES-256-GCM vault), db (Prisma), providers (model gateway), rate-limit |
| `prisma/` | Dual schemas: `schema.prisma` (PostgreSQL) + `schema.sqlite.prisma` (SQLite dev) — keep both in sync |
| `tests/` | Test harness (preload provisions a throwaway DB) |
| `docs/` | Architecture, deployment, decision records, engineering history |

## Ground rules

1. **Read before writing:** `docs/DECISIONS.md` explains why the codebase is shaped the way it is.
2. **Never claim untested work.** "Not run" is acceptable; fabricated results are not.
3. **One model layer.** Features build on `src/lib/providers.ts` — no parallel engines, no client-side key handling.
4. **Keep it light.** Every new dependency needs a reason. Prefer platform APIs (node:crypto, fetch, AbortSignal).
5. **Honest UI.** Roadmap features stay labeled *soon*; demo behavior stays labeled *demo*.
6. **Tenant isolation is non-negotiable.** Every new query must be scoped by the session user, and ship with a test if the pattern is new.
7. **Schema changes touch both Prisma files** and any migration notes in docs/DEPLOYMENT.md.
8. **Conventional commits**, one focused change per commit, feature branches → PRs, no force-push.
9. **Licenses:** Apache-2.0 core. Don't import code from unlicensed or custom-licensed projects (see docs/research/OPEN_SOURCE_REUSE_REGISTER.md).

By contributing, you agree your contributions are licensed under Apache-2.0.
