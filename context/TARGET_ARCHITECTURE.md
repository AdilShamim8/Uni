# TARGET ARCHITECTURE — ReWoo Workspace

**Status: Target design. Delivery status is tracked in PROGRESS.md / TASKS.md.**

## Strategy: "Strangler at the edge, preserve the core"

The proven Python agent core (`rewoo/`) is preserved and remains the self-hosted engine. The ReWoo Workspace is a TypeScript application added at `you/`, owning everything user-facing and multi-user.

## ReWoo Workspace application (TypeScript)

- **Framework:** Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui-style component system.
- **Data:** Prisma ORM. SQLite for local/self-host; schema written PostgreSQL-portably (no SQLite-only types in models that target hosted).
- **Auth:** first-party credentials (email + password, argon2/scrypt-class hashing), opaque session tokens (httpOnly cookies), per-user tenant isolation on every query.
- **Credential vault:** provider API keys encrypted at rest with AES-256-GCM using a server-side master key; decrypted only inside the server-side gateway; never returned by any API, never logged, never sent to the client.
- **Model gateway (server-side):** provider-agnostic execution layer. Providers at launch: OpenAI, Anthropic, Google Gemini, OpenRouter, Groq, Mistral, plus any OpenAI-compatible custom endpoint (covers Ollama, LM Studio, etc.). Streaming via SSE. No hardcoded model lists — models fetched from provider APIs where available.
- **Workspace UI:** progressive navigation shell; design tokens for color/type/spacing/elevation; light + dark themes; keyboard navigable; responsive to mobile.
- **Realtime:** SSE for streaming; upgrade path to WebSockets when bidirectional needs arrive.

## Boundaries

- Workspace → Python engine: documented HTTP contract (later phase); not required for chat milestones.
- No user-generated code executes on the app server.
- Every agent/tool action carries permissions, budget, cancellation, and audit records (later milestones; not claimed before built).

## Scaling target (to be measured, not assumed)

1,000 registered users / 100 concurrent sessions as the first load target. State Next.js services horizontally; durable job state in DB. Publish load-test evidence before claiming capacity.
