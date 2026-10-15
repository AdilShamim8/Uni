# NEXT STEPS

1. **Review & merge:** `feat/you-workspace` PR — Phase Zero audit docs + the `you/` application (Milestones 1–2).
2. **CI:** land the `you/` workflow (install → lint → typecheck → build) and a Python test matrix (Linux + Windows, 3.9–3.14) to close the D5 verification gap.
3. **Live-key verification:** run the streaming integration test from an allowed region (T14) to convert "adapters implemented" into "verified against live providers."
4. **Automated tests for `you/`:** auth flows, vault round-trip, adapter fixtures, two-user isolation regression (T16).
5. **Milestone 3 scoping:** durable agent runs — task state machine, tool permissions, execution timeline, approval gates; define the HTTP contract with the Python engine for long-horizon delegation.
6. **Owner decision needed:** engines extraction plan (D4/ADR-007) — options memo after Milestone 3.
