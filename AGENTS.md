# AGENTS.md — Contributor & Coding-Agent Guide

Welcome, agent or human contributor. Read this before touching the repository.

## What this repository is

Two products, one repo:

1. **ReWoo (Python, existing, working)** — single-user personal AI agent app: FastAPI + SQLite + agent runtime. Lives in `rewoo/`, `web/` (Vite UI), `engines/` (vendored MIT engine trees), `tests/`.
2. **ReWoo Workspace (TypeScript, new)** — the multi-user open-source AI workspace (Next.js), and the product's primary web surface. Lives in `you/` (historical directory name; product identity is ReWoo everywhere user-facing — ADR-009). See `context/PROGRESS.md` for what actually works today.

## Ground rules (non-negotiable)

1. **Read before writing:** `context/PROGRESS.md`, `context/TASKS.md`, `context/DECISIONS.md`, `docs/engineering/CURRENT_STATE_AUDIT.md`.
2. **Never claim untested work.** Update `context/TEST_RESULTS.md` with real evidence. "Not run" is acceptable; fabricated results are not.
3. **Preserve working software.** Do not delete or rewrite `rewoo/`, `web/`, or `engines/` without an approved ADR. Engines extraction needs owner sign-off (ADR-007).
4. **Secrets:** never commit credentials, tokens, `.env` files, or logs containing them. Provider keys are stored encrypted (AES-256-GCM) and never returned by APIs.
5. **Commits:** conventional commits, one focused change per commit, sequential pushes, no force-push, no merging unverified changes. Work on feature branches → PRs.
6. **Licenses:** root is Apache-2.0. Vendored trees are MIT — preserve their notices (`NOTICE`, `THIRD_PARTY_NOTICES.md`). Do not import code with unknown licenses. Never copy proprietary UI, branding, or assets.
7. **Honest docs:** docs describe what exists, not what is hoped. Status vocabulary lives in `context/FEATURE_MATRIX.md`.
8. **Security:** report per `SECURITY.md`; SSRF/path traversal/auth regressions must ship with regression tests.

## Where things live

| Path | Contents |
|---|---|
| `rewoo/` | Python application (core, agent, api, models, memory, tools, channels, connectors) |
| `web/` | Vite React UI for the Python app (prebuilt → `rewoo/web/dist`) |
| `engines/` | Vendored engines — do not modify casually; upstream sync scripts only |
| `you/` | ReWoo Workspace Next.js app (see its own README) |
| `context/` | Durable engineering context (vision, architecture, decisions, tasks, progress) |
| `docs/` | Deep documentation (engineering audits, research) |
| `tests/` | Python test suite |

## Definition of done (extract)

Feature works end-to-end · tests pass · no secret exposed · docs/status updated (`PROGRESS.md`, `FEATURE_MATRIX.md`, `TEST_RESULTS.md`) · commit pushed and verified on the remote.
