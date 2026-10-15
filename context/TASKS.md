# TASKS

Live task list. Items move here only when actively being worked; completed items are summarized in PROGRESS.md.

## Now (Milestone 1+2 — YOU foundation & chat) — ✅ core delivered 2026-10-15

- [x] T1: Scaffold `you/` Next.js app (TS, Tailwind, Prisma)
- [x] T2: Prisma schema — users, sessions, providerCredentials, conversations, messages
- [x] T3: Auth API + UI (sign-up, sign-in, sign-out, session guard)
- [x] T4: Design tokens + themes (light/dark) + typography
- [x] T5: Marketing homepage (Product A)
- [x] T6: Workspace shell — progressive navigation sidebar
- [x] T7: Credential vault (AES-256-GCM) + provider settings UI
- [x] T8: Model gateway — six providers + custom OpenAI-compatible, SSE streaming
- [x] T9: Model discovery + selector UI
- [x] T10: Chat UI — streaming, persistence, history, cancellation, regeneration
- [x] T11: Labeled offline demo mode
- [x] T12: Lint/typecheck clean (CI workflow pending → T15)

## Next (queue)

- [x] T21: Product-identity rebrand YOU → ReWoo (delivered 2026-10-15, `feat/rewoo-rebrand`) — ADR-009
- [x] T22: Phase Zero docs completed — DEFECT_REGISTER / REPOSITORY_CLEANUP_PLAN / OPEN_SOURCE_REUSE_REGISTER (ADR-010 reuse gate)

- [ ] T14: Live-key streaming integration test from an allowed region (blocked in current env — provider 403 on region)
- [x] T15: CI workflow for the workspace (install → lint → typecheck → build) — landed as `rewoo-workspace-ci.yml` (renamed from `you-ci.yml`; content unchanged apart from name/paths)
- [ ] T16: Automated test suite for `you/` (auth flows, vault round-trip, gateway adapter unit tests with recorded fixtures, two-user isolation regression)
- [ ] T17: Token/cost accounting aggregates per provider + spending display
- [ ] T18: Message editing + branching
- [ ] T19: File attachments (image + document)
- [ ] T20: Agent foundation (Milestone 3 scope definition + durable run model)

## Python track (parallel, small)

- [ ] Re-verify D2 SSRF fix with redirect regression test
- [ ] Re-verify D3 path traversal on Windows paths
- [ ] D5: fix/confirm the three failing tests in CI
- [ ] D7: OAuth state TTL sweep
