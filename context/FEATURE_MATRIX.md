# FEATURE MATRIX

Status legend: **✅ Verified** (works, evidence exists) · **🟡 Partial** (exists, known gaps) · **⛔ Missing** (not built) · **🔌 Integration** (via third-party) · **🗓 Planned** (on roadmap)

## YOU application (new TypeScript layer)

| Capability | Status | Notes |
|---|---|---|
| Marketing homepage | 🗓 Planned | Milestone 1 |
| Multi-user accounts (sign-up/in/out) | 🗓 Planned | Milestone 1 |
| Session management + isolation | 🗓 Planned | Milestone 1 |
| Design system (tokens, themes, a11y) | 🗓 Planned | Milestone 1 |
| Workspace shell + progressive nav | 🗓 Planned | Milestone 1 |
| BYOK provider vault (encrypted) | 🗓 Planned | Milestone 2 |
| Model discovery (live fetch) | 🗓 Planned | Milestone 2 |
| Streaming chat (SSE) | 🗓 Planned | Milestone 2 |
| Conversation persistence | 🗓 Planned | Milestone 2 |
| Model switching per conversation | 🗓 Planned | Milestone 2 |
| Offline demo mode | 🗓 Planned | Milestone 2 (echo-style demo brain, clearly labeled) |
| Token/cost tracking | 🗓 Planned | Later milestone |
| File attachments | 🗓 Planned | Later milestone |
| Agents (durable runs, delegation) | 🗓 Planned | Milestone 3 |
| Deep research with citations | 🗓 Planned | Milestone 4 |
| Knowledge / memory | 🗓 Planned | Milestone 4 |
| Skills & extensions | 🗓 Planned | Milestone 4+ |
| Scheduling / automations | 🗓 Planned | Milestone 5 |
| Approvals & permissions UI | 🗓 Planned | Milestone 3+ |

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
