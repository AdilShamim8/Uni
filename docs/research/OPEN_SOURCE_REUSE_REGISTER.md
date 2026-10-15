# Open-Source Reuse Register — ReWoo

**Every piece of third-party open-source code considered for, or integrated into, ReWoo — with license, attribution obligations, integration strategy, and risks.** This register is the compliance record required by the master engineering prompt §6 and AGENTS.md ground rule 6.

License metadata verified 2026-10-15 via the GitHub API (`/repos/{owner}/{repo}` and `/repos/{owner}/{repo}/license`) at each repo's default branch HEAD. Stars/status are point-in-time.

---

## A. Currently vendored / reused in the repository

| Import | Source & version | License | Attribution obligations | Integration location | Local modifications | Known risks |
|---|---|---|---|---|---|---|
| Paperclip engine tree | github.com/paperclipai/paperclip @ vendored | MIT | Preserve copyright + license notices in-tree | `engines/paperclip/` | None (upstream-sync only) | 292 MB aggregate vendor weight (D4); upstream drift |
| Hermes Agent engine tree | github.com/NousResearch/hermes-agent @ vendored | MIT | Preserve notices; skill import paths documented | `engines/hermes-agent/` | None | Same as above |
| OpenClaw engine tree | github.com/openclaw/openclaw @ vendored | MIT | Preserve notices | `engines/openclaw/` | None | Same as above |
| shadcn/ui component base | github.com/shadcn-ui/ui (template snippets) | MIT | Per-component attribution kept via file headers where present | `you/src/components/ui/*` | Styled/extended per design system | None material (MIT, snippet license) |
| Design inspiration only | Linear/Notion/Vercel/Apple product surfaces | — (no code copied) | None | Design language of `you/` | n/a | None — no proprietary assets or code copied, per master prompt §9 |

Vendored-tree attribution is centralized in `NOTICE`, `ATTRIBUTION.md`, and `THIRD_PARTY_NOTICES.md`; upstream URLs and sync scripts live under `engines/README.md` and `scripts/`.

## B. Projects named in the master engineering prompt (2026-10-15 review)

| Project | License (verified) | Reuse verdict | Strategy & reasoning |
|---|---|---|---|
| **LibreChat-AI/LibreChat** (~45.7k★, TypeScript) | **MIT** | ✅ **Approved for code reuse** | Highest-value legal candidate. Candidate modules for the ReWoo workspace: (1) provider adapter patterns for OpenAI/Anthropic/Gemini + model discovery; (2) conversation/branching data model; (3) file-attachment handling. Our workspace already independently implements the core gateway (Milestones 1–2); LibreChat becomes the reference for **Milestone-2 follow-ups** (message editing/branching T18, attachments T19) — port specific modules with copyright headers intact + entry in this register, rather than adopting the whole app (per the no-standalone-apps rule). |
| **milind-soni/OpenMausBot** (~4.9k★, TypeScript, active) | **Apache-2.0** | ✅ **Approved for code reuse** | Candidate for the **Milestone-3 agent foundation**: its "VM the bots can use" isolation model maps to our execution-sandbox requirement. Reuse obligations: retain LICENSE + NOTICE, state changes. Assess its VM sandbox implementation before designing our tool-execution isolation. |
| **composio-community/open-dot** (~647★, TypeScript) | ⚠️ **No LICENSE file** | ❌ **No code copy** | Unlicensed = all rights reserved by default. Ideas only (personal agents with own-computer execution). If useful, implement original equivalents. Re-check the repo periodically — the project may add a license. |
| **Anil-matcha/open-dots** (~5.8k★, Python) | ⚠️ **No LICENSE file** | ❌ **No code copy** | Same reasoning as open-dot. Self-hosted agent workspace concepts (closest to our product) — usable as a feature-comparison reference only. |
| **open-webui/open-webui** (~155.8k★, Python) | ⚠️ **Custom "Open WebUI License"** (BSD-3-style + branding-retention clause) | ❌ **No wholesale reuse** | The branding-protection clause makes embedding their UI/branding-dependent code into a differently-branded product legally fragile. Backend concepts (model management, RBAC patterns) may inform original implementations. Do not vendor. |
| **lobehub/lobehub** (~83.2k★, TypeScript, default branch `canary`) | ⚠️ **"LobeHub Community License"** (Apache-2.0 base + commercial-distribution restriction for derivative works) | ❌ **No code copy for distribution** | Distributing a derivative of LobeChat requires a commercial license from LobeHub LLC. Design-level inspiration only. (Note: `lobehub/lobe-chat` now redirects; the active repo is `lobehub/lobehub`.) |

## C. Previously surveyed landscape (design-level reuse only)

The 36-repo survey in `RESEARCH.md` (root) documents idea-level reuse — primitives such as delegation budgets, approval gates, execution legibility, chat-native distribution — with **no code copied** from any non-permissively-licensed source. That document remains the record for those decisions.

---

## Obligations checklist (applies to every future import)

1. Record: upstream URL, version/commit SHA, license, local modifications, integration location, tests.
2. Preserve original copyright notices and license files in the vendored path.
3. Add the entry to `THIRD_PARTY_NOTICES.md` and this register in the same commit.
4. Security-review imported code for credential handling, filesystem access, shell execution, networking, and browser automation before first use.
5. Never import code with an unknown, incompatible, or missing license (per master prompt §6).
