# frontend-backend-map.md — feature → API → backend mapping

One row per **implemented** server feature, added when its gate lands.
Browser checks are presentation only; the authorization column is the
enforced rule, not a UI flag. Status vocabulary: `local-only`,
`server+local`, `server`, `not-started`, `deferred`.

| Feature | UI route/component | Current store/service | API endpoint | Contract schema | Backend service | Tables | Authorization rule | Tests | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| (B00) Chat branching, demo + browser BYOK | `/`, `/c/:id` ChatPage | `store.ts` + `liveChatAdapter` | — | — | — | — (localStorage) | — | `chatFlow`, `conversationTree`, `sseProtocol`, `byok` | local-only |
| (B00) Work demo + live BYOK drafting | `/work` WorkPage | `workStore.ts` | — | — | — | — (localStorage) | — | `workFlow`, `workAiDraft`, `workStore` | local-only |
| (B00) Employees + memory | `/agents/:id` EmployeeView | `agentsStore.ts` | — | — | — | — (localStorage) | — | `agentsFlow`, `agentMemory`, `employeeThreadLifecycle` | local-only |
| (B00) Plugins (built-ins, grants, receipts) | `/plugins` + ThreadPluginBar | `pluginsStore.ts`, `dispatcher.ts` | — | — | — | — (localStorage) | browser-side only | `pluginsFlow`, `chatPlugins` | local-only |
| (B00) Library artifacts/versions | `/library` LibraryPage | `libraryStore.ts`, `canonicalSave.ts` | — | — | — | — (localStorage) | — | `libraryFlow`, `artifactVersions`, `canonicalSave` | local-only |
| (B00) Backup/restore (local) | Settings → Backup | `workspaceBackup.ts` | — | — | — | — (localStorage) | — | `workspaceBackup` | local-only |
| (B02) Identity / session | Settings → Account (sign-in/up/out) | `state/serverSessionStore.ts` + `services/api/serverSession.ts` | Better Auth `/api/auth/*` + `GET /api/v1/me` | `@uni/contracts/me` (frontend mirrors locally) | `modules/auth`, `modules/me` | user, session, account, workspace, workspace_member | session cookie (HttpOnly) → server-derived workspace; CSRF origin checks | backend: `auth.integration` (6); frontend: `accountServer` (7) | server+local |
| (B02) Conversation persistence (read + import) | Settings → Account → Chats on this account | `serverSessionStore` | `GET/POST /api/v1/conversations`, `GET /:id`, `POST /import/preview+commit` | `@uni/contracts/conversations`, `backup` | `modules/conversations`, `modules/importer` | conversation, conversation_node, import_batch, import_id_map | workspace-scoped rows; foreign IDs → 404; idempotent checksum import | backend: `conversations.integration` (7), `import.integration` (6); frontend: `accountServer` (7) | server (read-only view; chat surface send lands with B03) |

Rows for server features are appended at their gates (B02: identity,
conversations, import; B03: providers, runs; B04: employees/library;
B05: plugins; B06: work; B07: files).
