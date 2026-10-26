# THIRD_PARTY_NOTICES.md

This file summarizes third-party components used directly by the Uni
backend and the license texts preserved under `third_party/licenses/`.
The full inventory (including transitive dependencies, resolved from
lockfiles) is generated and reviewed at B08 — see
`docs/opensource-reuse.md` for the live ledger.

## Backend runtime dependencies

| Component | Version | License | License text |
| --- | --- | --- | --- |
| fastify | 5.12.7 | MIT | `third_party/licenses/fastify/LICENSE` |
| @fastify/cors | 11.3.1 | MIT | `third_party/licenses/fastify-cors/LICENSE` |
| zod | 3.25.76 | MIT | `third_party/licenses/zod/LICENSE` |
| drizzle-orm | 0.45.4 | Apache-2.0 | `third_party/licenses/drizzle-orm/LICENSE` |
| pg (node-postgres) | 8.23.1 | MIT | `third_party/licenses/pg/LICENSE` |
| pino | 9.14.0 | MIT | `third_party/licenses/pino/LICENSE` |
| dotenv | 18.0.9 | BSD-2-Clause | `third_party/licenses/dotenv/LICENSE` |
| better-auth | 1.7.12 | MIT | `third_party/licenses/better-auth/LICENSE` |
| @uni/contracts | 0.1.0 (local) | MIT (Uni's own) | repository source |

## Backend development/test dependencies

| Component | Version | License | License text |
| --- | --- | --- | --- |
| typescript | 5.6.3 | Apache-2.0 | `third_party/licenses/typescript/LICENSE` |
| drizzle-kit | 0.31.11 | MIT | `third_party/licenses/drizzle-kit/LICENSE` |
| tsx | 4.23.15 | MIT | `third_party/licenses/tsx/LICENSE` |
| vitest | 2.1.9 | MIT | `third_party/licenses/vitest/LICENSE.md` |
| embedded-postgres | 18.4.0-beta.17 | MIT | `third_party/licenses/embedded-postgres/LICENSE.md` |

## Frontend dependencies

Pre-date the B-gates; recorded in `frontend/package.json` and its
lockfile (React, Vite, Zustand, react-markdown, Papa Parse, Vitest,
Testing Library, lucide-react, react-router-dom, Tailwind CSS and their
transitive dependencies). Their license inventory is generated at B08
alongside the backend's.

## Notices

- MIT-licensed components: permission notice preserved above and in each
  `third_party/licenses/<name>/LICENSE` file.
- Apache-2.0 components (drizzle-orm, typescript): full license text
  preserved; no NOTICE files are shipped by these packages at the
  versions in use.
- BSD-2-Clause component (dotenv): license text preserved.
- One upstream example has been adapted: the Better Auth Fastify
  integration example (`docs/content/docs/integrations/fastify.mdx`,
  MIT) → `backend/src/modules/auth/auth.routes.ts`; modifications and
  validation are recorded in `docs/opensource-reuse.md` Section 2.
- Vendored source: the OpenClaw repetition guard
  (`packages/agent-core/src/repetition-guard.ts` and its test/fixtures,
  MIT, (c) 2026 OpenClaw Foundation) at commit
  `29397d2a185c29d4b4d79d2ad41af0f7cf1f6a9b` →
  `backend/src/vendor/openclaw/` with its upstream suite adapted to
  `backend/tests/vendor-openclaw-repetition-guard.test.ts`. That file
  itself adapts Hermes Agent (MIT, (c) 2025 Nous Research) at Hermes
  commit `acc3cada0da86c81efc8aa6c5a291989549ca900`; OpenClaw's own
  attribution is preserved at
  `third_party/licenses/openclaw/THIRD_PARTY_NOTICES.md`. Integrity
  hashes and modification records live in `third_party/sources.lock.json`.
  No other third-party code has been adapted or vendored into Uni
  source; any future adaptation will be recorded there with upstream
  commit, path, and modifications.
