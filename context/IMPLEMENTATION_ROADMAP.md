# IMPLEMENTATION ROADMAP

Dependency-driven milestones. Each milestone must end with a usable, tested increment.

## Milestone 0 — Repository stabilization ✅ (this commit)
Phase Zero audit landed (`docs/engineering/CURRENT_STATE_AUDIT.md`), context directory established, decisions recorded (ADR-001..008).

## Milestone 1 — Premium application foundation 🗓
- `you/` Next.js + TypeScript + Tailwind scaffold (additive; nothing existing touched)
- Prisma schema: users, sessions, provider credentials, conversations, messages
- Auth: sign-up / sign-in / sign-out, hashed passwords, httpOnly sessions, per-user isolation
- Design system: tokens, light/dark, typography, spacing, component variants
- Marketing homepage (Product A)
- Workspace shell with progressive navigation (Product B skeleton)

## Milestone 2 — Production-ready multi-model chat 🗓
- Encrypted BYOK vault (AES-256-GCM) for OpenAI, Anthropic, Gemini, OpenRouter, Groq, Mistral, custom OpenAI-compatible (Ollama etc.)
- Live model discovery with fallback catalog; model selector with capability info
- Streaming chat (SSE) with cancellation, retry, regeneration
- Conversation persistence, history, folders/search (basic), branching (later)
- Labeled offline demo mode
- Token accounting display

## Milestone 3 — Agent foundation 🗓
- Durable agent runs, tool execution within permission sets, execution timelines
- Multi-agent delegation with real state; approval checkpoints

## Milestone 4 — Advanced workspace 🗓
- Deep research workflow with citations; knowledge base + memory; artifacts panel; skills framework

## Milestone 5 — Persistent automation 🗓
- Scheduling, background jobs, notifications, approvals, companion workflows

## Milestone 6 — Business operating system 🗓
- Coordinated business workflows, integrations, delegation dashboards

## Milestone 7 — Production hardening & community release 🗓
- Security verification, load testing (1,000 users / 100 concurrent target with published evidence), observability, self-host docs, contributor readiness

## Parallel Python track
- Fix/verify D5 test trio; add D2/D3 regression tests; D7 OAuth TTL; D8 SSE heartbeat
