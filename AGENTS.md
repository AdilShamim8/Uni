# AGENTS.md — Contributor & Coding-Agent Guide

Welcome, agent or human contributor. Read this before touching the repository.

## What this repository is

**ReWoo** — an open-source, multi-user AI workspace (Next.js 16 + TypeScript + Tailwind 4 + Prisma) at the repository root. Multi-user accounts, an encrypted BYOK provider vault, live model discovery, and streaming chat. Deployable to Vercel or any Node host. Apache-2.0.

History: before v0.3 the repo also carried a single-user Python app and ~1.1 GB of vendored engines; both were retired (owner-approved) — see `docs/DECISIONS.md` ADR-010…013.

## Ground rules (non-negotiable)

1. **Read before writing:** `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, and `docs/engineering/DEFECT_REGISTER.md`.
2. **Never claim untested work.** "Not run" is acceptable; fabricated results are not.
3. **One model layer.** All AI calls go through `src/lib/providers.ts`. No parallel engines, no client-side key handling, no mock pretending to be live.
4. **Secrets:** never commit credentials, tokens, or `.env` files. Provider keys are stored encrypted (AES-256-GCM) and never returned by APIs.
5. **Tenant isolation:** every query is scoped by the session user. New query patterns ship with tests (`src/lib/__tests__/db-isolation.test.ts` shows the pattern).
6. **Schemas stay in sync:** `prisma/schema.prisma` (PostgreSQL) and `prisma/schema.sqlite.prisma` (SQLite) differ only in the datasource block.
7. **Keep it light:** every dependency needs a justification. Prefer platform APIs (node:crypto, fetch, AbortSignal) over packages.
8. **Honest UI:** roadmap features stay labeled *soon*; demo behavior stays labeled *demo*.
9. **Commits:** conventional commits, one focused change per commit, feature branches → PRs, sequential pushes, no force-push.
10. **Licenses:** root is Apache-2.0. Don't import code from unlicensed or custom-licensed projects (verdicts in `docs/research/OPEN_SOURCE_REUSE_REGISTER.md`).

## Definition of done

Feature works end-to-end · `bun run lint && bun run typecheck && bun test && bun run build` all green · no secret exposed · docs updated (CHANGELOG, DECISIONS when architectural) · commit pushed and verified on the remote.
