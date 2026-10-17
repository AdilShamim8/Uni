# Four-Week Roadmap (Provisional)

Date: 17 October 2026 · Status: planning artifact, not a delivery promise

This sequence reserves focus for one product surface at a time. It is intentionally provisional: provider integrations, backend services, and the later products (Work, Email) require decisions that belong to their own milestones. Nothing in this roadmap implies that all products or integrations will be finished within a month.

## Week 1 — Chat frontend (this milestone)

**Scope:** shared shell and navigation, design tokens with light/dark/system themes, empty state and composer with attachments and tool picker, deterministic simulated streaming with stop/retry/regenerate, message-tree branching (edit + variants), history with search/rename/pin/archive/delete/undo/export, local persistence with schema versioning and safe recovery, temporary chats, settings (appearance, chat preferences, data tools, provider/model configuration UI with simulated connection test), and clearly labeled previews for advanced workflows.

**Exit criteria:** runnable frontend, lint/typecheck/build/tests green, responsive and theme checks recorded, docs complete, branch pushed with a draft PR.

## Week 2 — Frontend hardening + expanded research and canvas flows

- Accessibility pass with real assistive technology (screen-reader smoke tests, full keyboard audit of edge paths).
- Performance pass on long conversations (windowed rendering if measurements justify it).
- Research preview upgrade: multi-step simulated pipelines with editable outlines and exportable reports.
- Canvas upgrade: versioned document edits, diff view, richer code fixtures — still no code execution.
- Cross-browser verification matrix and visual regression snapshots.

## Week 3 — Work UI

- Work product shell: documents, notes, and lightweight task lists as local-first UI.
- Reuse of the shell/navigation and design tokens; capability-gated entries stay honest about what is simulated.
- Data model and persistence schema extension (versioned migration from v1).

## Week 4 — Email UI + integration-readiness review

- Email product shell (local fixtures only; no real mail transport).
- Integration-readiness review: define the secure credential story, provider adapter contract, and backend seam before any real integration is built.
- Decide which parts of the capability registry graduate from "demo" to "planned integration".

## Guardrails that hold across all weeks

- No subscription gates in the interface; capabilities are explained honestly, never faked.
- No backend, database, real authentication, provider SDK calls, or analytics until the integration milestone explicitly designs them.
- All simulated behavior is labeled; every control either works locally, previews honestly, or explains why it is disabled.
