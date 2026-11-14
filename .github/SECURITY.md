# Security Policy

Uni is an independent, open-source AI workspace. This policy describes
how to report security issues and which guarantees the project actually
makes — no more, no less.

## Reporting a vulnerability

Use GitHub's **private vulnerability reporting** on this repository
(Security tab → "Report a vulnerability"). Please do not open a public
issue for anything that could put users' data or credentials at risk.

Include what you can of: the affected area (backend route, frontend
surface, dependency), a minimal reproduction, and the impact you see.
Reports are triaged by the maintainers; there is no paid bounty program
and no contractual response SLA — this is a volunteer-run project.

## Scope

In scope:

- `backend/` — request handling, auth/session handling, workspace
  scoping, credential storage, the SSRF guards, and connector/MCP
  egress paths.
- `frontend/` — anything that could leak the browser's local BYOK
  credential slice or workspace exports.
- `packages/contracts/` — schema behavior both sides rely on.
- The CI workflows in `.github/workflows/`.

Out of scope:

- Self-hosted deployments misconfigured by the operator (exposed
  ports, weak master keys, missing TLS).
- Volumetric abuse or availability attacks on any deployment.
- Findings in demo adapters that are clearly labeled demo and never
  touch a real provider.

## Security invariants this project maintains

These are the guarantees reviewers can hold the code to; a change that
weakens any of them is a bug regardless of exploitability:

- **Credentials are secrets.** In local mode they live only in the
  browser's separate credentials slice and never enter exports. In
  server mode they are encrypted at rest (versioned AES-GCM envelope),
  scoped to a workspace, redacted in every API response, and never
  logged.
- **The workspace scope is server-derived** (session → membership).
  A `userId`, role, or `workspaceId` sent by the browser is never
  trusted.
- **Egress is guarded.** Provider, connector, and MCP endpoints pass
  the SSRF guard; MCP transports are time-bounded.
- **Status labels are truthful.** No placeholder endpoints, no
  fabricated live results — a surface that is not connected says so.
- **Exports contain only the workspace's own data**, and migrations
  never destroy user data.

## Dependency reports

For vulnerable dependencies, the same private reporting channel applies.
Dependabot alerts are enabled on this repository; automated pull
requests are reviewed like any other change.
