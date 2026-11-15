# Capability parity — Uni OpenClaw adoption

Inventory generated from the pinned upstream source tree (`c5381ef2`,
`engine/openclaw`), its `docs/` tree, `ui/src/pages/`, `extensions/` and
`apps/`. This file tracks the honest state of every capability family: what
the import provides, its Uni entry point, configuration prerequisites, and
what has actually been verified in this environment. Statuses:
`imported` (source present, nothing more), `configured` (wired for this
deployment), `fixture-verified` (exercised with deterministic fixtures),
`live-verified` (exercised against a real provider/service), and
`platform-blocked` (prerequisite unavailable in the current environment).

Runtime verification caveat: the adoption sandbox cannot hold a full
`node_modules` install (disk), so no Gateway boot or UI browser journey has
run yet. Everything below is `imported` unless stated otherwise; statuses
will move as verification proceeds on capable hardware (see
`verification.md`, O03 record).

| Capability | Source evidence | Uni UI entry | Config prerequisites | Status | Remaining limit |
| --- | --- | --- | --- | --- | --- |
| Gateway lifecycle & status | `src/gateway/`, `docs/gateway/` | Connection page | Isolated state dir | imported | No runtime boot yet (disk-blocked) |
| Control UI (Solid) | `ui/` | `/` routes | `pnpm ui:build` | imported | Browser journey not run |
| Chat sessions/streaming/history | `ui/src/pages/chat`, `docs/concepts` | Chat routes | Gateway + model | imported | Not exercised |
| Models & provider auth | `docs/providers/`, `ui/src/pages/model-providers`, `model-setup` | Settings → Models | Provider API keys | imported | No keys in env → fixture-only path |
| Agents & skills | `ui/src/pages/agents*`, `skills/` | Agents routes | Gateway profile | imported | Not exercised |
| Tools & approvals | `ui/src/pages/approval*`, `docs/tools/` | Approval routes | Permission config | imported | Not exercised |
| Channels (Discord, Matrix, iMessage, …) | `docs/channels/`, `extensions/` | Channels routes | Channel accounts | imported | Needs channel accounts; see remaining limit |
| Routines/cron | `ui/src/pages/cron`, `docs/automation/` | Automations | Gateway scheduler | imported | Not exercised |
| Memory & search | `extensions/active-memory`, docs | Memory surfaces | Gateway profile | imported | Not exercised |
| Plugins & MCP | `ui/src/pages/plugins`, `apps`, `docs/plugins/` | Apps/Plugins routes | Plugin install | imported | Not exercised |
| Browser control | `ui/src/components/browser/`, docs | Chat tools | Playwright/browser binary | imported | Browser binary unavailable |
| CLI/TUI | `openclaw.mjs`, `docs/cli/` | Terminal | Node runtime | imported | Not exercised |
| Backup/restore | `docs/`, `src/` ops tooling | CLI/docs | State dir | imported | Not exercised |
| Native apps (iOS/macOS/Android/Linux) | `apps/` | Platform installs | Xcode/Android SDK | imported | Signed builds out of scope here |
| Voice/TTS/Canvas | extensions, docs | Chat surfaces | Platform audio | imported | Platform-dependent; unverified |
| Uni theme & identity | `ui/public/themes/uni.css`, delta manifest | Appearance settings | none | configured | Theme registered; visual journey pending |
| Uni default selection | `ui-appearance-preferences.ts` | First run | none | configured | Existing profiles keep stored prefs |

## Legacy Uni features (old stack)

| Legacy feature | Disposition |
| --- | --- |
| Bring-your-own-key provider connections | Migrating to OpenClaw provider auth (O10); adapters in `data-migration.md` |
| Conversations (PostgreSQL + local storage) | Migration mapping in `data-migration.md`; legacy read-only archive planned |
| Work/tasks (routines) | OpenClaw cron/routines adopt the concept; field mapping documented in `data-migration.md` |
| Old React frontend / Fastify backend | Transitional code retained; retired after migration acceptance (O18) |

No invented parity percentages: each row states exactly what was and was not
verified. Rows move to `fixture-verified`/`live-verified` only with recorded
evidence in `verification.md`.
