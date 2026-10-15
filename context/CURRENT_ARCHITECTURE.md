# CURRENT ARCHITECTURE

Authoritative deep-dive: **docs/engineering/CURRENT_STATE_AUDIT.md** (Phase Zero, 2026-10-15).

## One-paragraph summary

ReWoo today is a single-user Python 3.9+ application: FastAPI HTTP layer (`rewoo/api/`, OpenAI-compatible `/v1`, SSE), an agent runtime with delegation/budgets/approvals/skills/routines (`rewoo/agent/`), a BYOK multi-provider model router with an offline demo brain (`rewoo/models/router.py`), memory with citations (`rewoo/memory/`), 16-table SQLite persistence (`rewoo/db.py`), Telegram channel + Google Drive connector, three vendored MIT engine trees (`engines/`: Paperclip, Hermes Agent, OpenClaw — 73.5k files), and a React 18 + Vite frontend (`web/`, prebuilt dist committed at `rewoo/web/dist`). Auth is an optional single shared token. There is no multi-user model, no PostgreSQL, and no TypeScript service layer yet — those arrive with the YOU application under `you/` (see TARGET_ARCHITECTURE.md).
