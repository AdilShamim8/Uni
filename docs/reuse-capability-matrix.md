# reuse-capability-matrix.md — actual feature integration and verification

One row per product capability. Statuses: `implemented-unverified`,
`fixture-verified`, `integration-verified`, `browser-verified`,
`live-provider-verified`, `deployment-verified`, `blocked`, `deferred`.
A green column never implies the others; empty cells mean "no evidence
of that kind exists". Updated at every effort milestone; the change
history lives in the effort manifest and verification.md.

Initial audit at REUSE_START_SHA `a84aac2b0` (2026-11-12): every row
re-derived from source + current test files this session, not copied
from older handoffs.

| Feature | Mode | Selected upstream | Commit/package | Uni adapter | Fixture tests | DB/worker integration | Browser evidence | Live-provider evidence | Deployed-origin evidence | Status / remaining blocker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chat message tree + branching (local) | local | — (Uni original) | — | `domain/conversationTree` + `store.ts` | conversationTree, chatFlow | — (localStorage) | golden-path sweeps (2026-10-29/30 waves) | — | — | browser-verified |
| Demo chat adapter | local | — (Uni original) | — | `services/mock` | chatFlow | — | prior sweeps | — | — | browser-verified |
| BYOK streaming chat (browser, OpenAI-compatible + Anthropic) | local | Vercel AI SDK | `ai@7`, `openai-compatible`, `anthropic` | `services/live/liveChatAdapter` | byok, sseProtocol | — | prior sweeps | Pollinations keyless completion (2026-11-03 ledger) | — | live-provider-verified |
| Provider presets + free models catalog | local | — (Uni original, live-probed) | — | `settings/providerPresets` + `freeModels` | providerPresets, freeModels, freeGuide | — | — | endpoint probes 2026-11-03 (point-in-time) | — | fixture-verified; re-probe before catalog edits |
| Server identity/workspaces | server | Better Auth | `better-auth@1.7` | `services/api/serverSession` | account fencing suites | auth.integration (6) | B03 E2E sign-up/in/out | — | — | browser-verified |
| Server providers (encrypted credentials, SSRF guard, readiness axes) | server | — (Uni original) | — | `services/api/serverProviders` | providers suites (integration, readiness, keyless, openrouter, body-limits) | ✅ embedded PG | B03 E2E add-provider | keyless probe path | — | browser-verified |
| Server chat runs (create/stream/cancel/replay, fingerprint idempotency, atomic admission) | server | Vercel AI SDK | `ai@7` | `services/api/serverRuns` (Account surface) | runs suites (integration, fingerprint, concurrent-create, atomic-*) | ✅ embedded PG | B03 E2E streamed reply; qa:live 119 | — | — | browser-verified |
| Agent sessions (turns, permissions, bounded tools, gated loop) | server | — (Uni original, abacus-inspired) | — | `serverSessionStore` agent slices | agent suites (roots, admission, permission-gate, execution-boundaries, bounded-tools, runs, sessions) | ✅ embedded PG | — | — | — | fixture-verified |
| Durable jobs (pg-boss worker + outbox) | server | pg-boss | `pg-boss@10.4.2` | `modules/jobs` + `worker.ts` | jobs-outbox (3) | ✅ | — | — | — | fixture-verified |
| Work tasks (durable runs, receipts, cancel/answer) | server | — (Uni original) | — | `services/api/serverWork` + WorkHome server mode | work-tasks, work-sync | ✅ | — | — | — | fixture-verified |
| Work demo + live BYOK drafting (local) | local | — (Uni original) | — | `workStore` + demo runner | workFlow, workAiDraft, workStore | — | prior sweeps | — | — | browser-verified |
| Employees (server) + memory (dual-mode panel) | server+local | OpenMausBot kernel (vendored, Apache-2.0) | `0d8eacc65` | `services/api/serverEmployees` + MemoryPanel | employees-memory (11), vendor suite (23) | ✅ | — | — | — | fixture-verified |
| Employee conversations on server | server | — (Uni original) | — | EmployeeView → server conversation | employee lifecycle suites | ✅ | — | — | — | fixture-verified |
| Library artifacts/versions + canonical saves | server+local | — (Uni original) | — | `services/api/serverLibrary` | library.integration (6), canonical (11) | ✅ | — | — | — | fixture-verified |
| Library/Canvas UI (local-first) | local | — (Uni original) | — | `libraryStore` + LibraryPage/Canvas | libraryFlow, artifactVersions | — | prior sweeps | — | — | browser-verified |
| Plugins (server registry, two-gate grants, receipts) | server | — (Uni original) | — | `services/api/serverContracts` | plugins.integration (6) | ✅ | — | — | — | fixture-verified |
| Plugins (local browser dispatcher) | local | — (Uni original) | — | `pluginsStore` + dispatcher | pluginsFlow, chatPlugins | — (browser-side) | prior sweeps | — | — | browser-verified |
| MCP servers (config, guarded transport, namespaced tools, always-ask) | server | MCP TypeScript SDK | `@modelcontextprotocol/sdk@1.32.2` | `services/api/serverMcp` + Plugins page section | mcp-servers, mcp-call (real SDK-server fixture) | ✅ | — | — | — | fixture-verified |
| Knowledge base (local lexical retrieval, cited excerpts) | local | — (Uni original) | — | `knowledgeStore` + KnowledgeSection | 51 tests (2026-10-30 wave) | — | prior sweeps | — | — | browser-verified; embeddings deferred |
| Conversation import (deliberate, idempotent) | server | — (Uni original) | — | Account → import | import.integration (6) | ✅ | — | — | — | fixture-verified |
| Workspace backup/restore (local) | local | — (Uni original) | — | `workspaceBackup` | workspaceBackup | — | — | — | — | fixture-verified |
| Server chat in the unified ChatPage | server | — (Uni original) | — | `features/chat/server/*` on `/sc` routes | serverChatPage 6, serverChatJourney 2, sidebarChatMode 7 | ✅ | — (browser pass pending) | — | — | fixture-verified — unification shipped this effort (RF-005–013); browser screenshot pass pending |
| Files upload/extraction (plain text: txt/md/csv/tsv/json/log) | server | — (Uni original) | — | Library knowledge section via `services/api/serverFiles` | files.integration 7 | ✅ (file_document, migration 0019) | — | — | — | fixture-verified — text formats only; binaries refused honestly; PDF/OCR still deferred |
| Workspace-scoped knowledge retrieval (lexical, excerpted) | server | — (Uni original) | — | knowledge_search agent tool + Library search | files.integration (retrieval cases), knowledge-search.integration 1 | ✅ | — | — | — | fixture-verified — term-frequency over extracted text; embeddings still deferred |
| Connectors (catalog: GitHub/Gmail/Slack/Notion) | server | — (Uni original, abacus registry design) | — | Plugins page section via `services/api/serverConnectors` | connectors.integration 4, connectorsSection 5 | — (static catalog, no rows) | — | — | — | fixture-verified — honestly NOT CONNECTED everywhere; real adapters (T027+) not started |
| Routines (schedules + unattended execution + history) | server | — (Uni original, abacus cron design) | — | Work surface RoutinesSection + detail dialog via `services/api/serverRoutines` | routines-cron 13, -crud 7, -scheduler 12, -execution 2, section/preview/detail 16 | ✅ (routine, routine_run, migrations 0011+0018; pg-boss worker carries the tick) | — | — | — | fixture-verified — unattended read-only sessions, slot semantics, bounded catch-up, honest terminals; browser pass pending |
| Isolated code execution | server | pending (P11) | — | — | — | — | — | — | — | **blocked** — bash tool deliberately inert without `UNI_AGENT_ISOLATED_EXECUTION` (F07) |
| Isolated browser execution | server | pending (Playwright-based, P11) | — | — | — | — | — | — | — | **blocked** — T039 not started |
| Messaging (Telegram/Discord/WhatsApp) | server | pending (P12) | — | — | — | — | — | — | — | **blocked** — T041–T043 not started |
| Voice (transcription/synthesis) | any | pending selection | — | — | — | — | — | — | — | **deferred** — no configured runtime; must stay honestly unavailable until one exists |
| Image generation | any | pending selection | — | — | — | — | — | — | — | **deferred** — same |
| Search/research with retained sources | server | pending | — | run receipts carry url/file source ids | work-sync | ✅ (receipts) | — | — | — | **deferred** — retained-source research surface not started |
| Deployment (reverse proxy, SSE, readiness) | server | — | — | — | — | qa:live 119 checks over compiled server | — | — | Vercel static (rate-limited note 2026-10-29) | partial deployment-verified |

Maintenance rules (prompt §10): every adopted component/engine gets its
row updated in the same change that lands it, with the exact
package/commit pinned and each evidence column filled only by real
runs performed in that change.
