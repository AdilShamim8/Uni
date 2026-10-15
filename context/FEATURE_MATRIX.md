# FEATURE MATRIX

Status legend: **✅ Verified** (works, evidence exists) · **🟡 Partial** (exists, known gaps) · **⛔ Missing** (not built) · **🔌 Integration** (via third-party) · **🗓 Planned** (on roadmap)

## YOU application (`you/`, delivered 2026-10-15 on feat/you-workspace)

| Capability | Status | Notes |
|---|---|---|
| Marketing homepage | ✅ Verified | Browser-verified 2026-10-15 |
| Multi-user accounts (sign-up/in/out) | ✅ Verified | scrypt + opaque sessions (SHA-256 at rest) |
| Session management + isolation | ✅ Verified | Every query user-scoped; scripted regression test pending |
| Design system (tokens, themes, a11y) | ✅ Verified | Warm-neutral + violet; light/dark; ARIA + keyboard |
| Workspace shell + progressive nav | ✅ Verified | Chat/Models live; 8 roadmap areas honestly labeled |
| BYOK provider vault (encrypted) | ✅ Verified | AES-256-GCM; masked previews only |
| Model discovery (live fetch) | ✅ Verified | With labeled fallback catalogs |
| Streaming chat (SSE) | ✅ Verified (demo + adapters) | Live-key streaming pending allowed-region test |
| Conversation persistence | ✅ Verified | Reload-verified; auto-titles; rename; delete |
| Model switching per conversation | ✅ Verified | Composer model picker + Models view |
| Offline demo mode | ✅ Verified | Always labeled "Demo brain" |
| Token/cost tracking | 🟡 Partial | Per-message usage when provider reports it; no aggregates yet |
| File attachments | 🗓 Planned | Later milestone |
| Message editing + branching | 🗓 Planned | Later milestone |
| Agents (durable runs, delegation) | 🗓 Planned | Milestone 3 |
| Deep research with citations | 🗓 Planned | Milestone 4 |
| Knowledge / memory | 🗓 Planned | Milestone 4 |
| Skills & extensions | 🗓 Planned | Milestone 4+ |
| Scheduling / automations | 🗓 Planned | Milestone 5 |
| Approvals & permissions UI | 🗓 Planned | Milestone 3+ |
| Automated test suite for `you/` | 🗓 Planned | Browser E2E done manually; scripted tests tracked |

## Existing ReWoo (Python, preserved)

| Capability | Status | Notes |
|---|---|---|
| Agent runtime (delegation, budgets, approvals) | ✅ Verified | `rewoo/agent/runtime.py`; tests exist |
| Multi-provider BYOK router + demo brain | ✅ Verified | `rewoo/models/router.py` (single-user) |
| Memory with citations | 🟡 Partial | O(N) scan (D9) |
| Routines / scheduler | ✅ Verified | `rewoo/agent/routines.py` |
| Skills library + Hermes import | ✅ Verified | `rewoo/agent/skills.py` |
| OpenAI-compatible API `/v1` | ✅ Verified | `rewoo/api/openai_api.py` |
| Telegram channel | ✅ Verified | `rewoo/channels/` |
| Google Drive connector | 🟡 Partial | OAuth state leak (D7) |
| Web UI (Vite) | 🟡 Partial | 9 pages; superseded later by YOU |
| Multi-user auth | ⛔ Missing | Single token only (D1) — solved in YOU layer |
| Engine integrations (Paperclip/Hermes/OpenClaw) | 🟡 Partial | Vendored; integration depth unverified live |

*This file is updated when verification evidence changes, not when code is merely written.*
