# ReWoo Research: How 36 Open-Source Agent Projects Shaped This Design

This document explains where ReWoo's architecture came from. It is a
distillation of a survey of 36 open-source "AI agent" repositories, organized
into what they're fundamentally trying to do, what ideas are worth reusing,
what ReWoo deliberately rejected, and how the surviving ideas map onto the
actual code in `rewoo/`.

## 1. Method

Three research passes (Groups A, B, C — 12 repos each) fetched each repo's
`README.md` and `LICENSE` via `raw.githubusercontent.com` at `HEAD`, and
sampled open issues via the GitHub API for the handful of repos with active
issue trackers (Paperclip, ChatDev, openclaw, agent-zero, OpenHands). No repo
was cloned in full and no source file was read line-by-line.

**Honesty about limits:** this is a rapid distillation for design purposes,
not a code audit. Claims about "what a repo does" come from its own
documentation and issue titles, not from running or reading its
implementation. Several repos had no LICENSE file at all, thin or
aspirational READMEs, or stub codebases (`CompanyOS`, `aicompanyos`,
`Autonomous-AI-Company-Operating-System`, `company-os` are pre-alpha or
scaffold-only) — those are treated as directional signal about the *category*
(what people wish existed), not as evidence of working software. Star/issue
counts were fetched where convenient but are not the point; the point is
which primitives and pain points recur independently across unrelated
authors, because convergence is the strongest signal available without
running the code.

## 2. The Landscape in One Page

36 repos cluster into 7 recognizable projects, mostly answering one question:
**"how do I run more than one AI agent and still understand what they're
doing?"**

1. **AI-company simulators** (Paperclip, ClawCompany, agentic-org, HubOS,
   company-os, aicompanyos, Autonomous-AI-Company-Operating-System,
   ufuksamet0/autonomous-company-os) — model a swarm of agents as a
   corporation: CEO/CTO/departments, budgets, governance, mission statements.
   Fundamentally about **authority and delegation at scale** — who may
   spend money / do what, and how work traces back to a goal.
2. **Pixel-office / spatial visualizers** (claw-empire, OpenOffice,
   AgentFleet, pixel-office, office-of-mh, CompanyOS) — a literal animated
   office where agents walk between desks. Fundamentally about
   **legibility**: making invisible background computation feel alive and
   watchable.
3. **Chat-native gateways** (openclaw, HubOS's channel layer) — one daemon,
   many chat surfaces (WhatsApp, Slack, Telegram...). Fundamentally about
   **distribution**: meet the user where they already are instead of
   building a new app.
4. **Coding-agent harnesses / process disciplines** (harness-kit,
   repository-harness, repo-harness, agent-harness ×3, jxiaow/agent-harness,
   SUNRNEHUI/agent-harness, harness-starter-kit, claude-harness,
   open-harness) — thin layers that turn ad-hoc chat with a coding agent into
   a disciplined process (stage gates, verification evidence, durable
   decision logs). Fundamentally about **trust and verification**: don't
   believe an agent's self-report of "done."
5. **Multi-agent SDKs/frameworks** (agency-swarm, AutoAgent, MetaGPT,
   ChatDev) — libraries/platforms for composing agents into structured
   pipelines (roles, typed artifacts, chat-chains). Fundamentally about
   **composability**: turning "prompting" into reusable, typed building
   blocks.
6. **General-purpose local agent runtimes** (agent-zero, OpenHands,
   deepklarity/harness-kit, mission-control) — self-hosted control centers
   that run one or many backend agents against a real desktop/browser/repo.
   Fundamentally about **capability**: give the agent a real environment to
   act in.
7. **Vanity / stub scaffolds** (CompanyOS, aicompanyos with real code but
   undeployed pieces, ujjwalredd's OS, Node-Features/company-os) — ambitious
   READMEs describing a governance/company layer that isn't built yet.
   Fundamentally about **aspiration outrunning delivery** — useful as a list
   of "things people want but nobody has shipped," not as working reference
   implementations.

The load-bearing observation across all seven clusters: **orchestration
(getting multiple agent calls to run in sequence/parallel with tools) is a
comparatively solved problem.** Nearly every repo has *some* working version
of plan → delegate → execute → report. What is unsolved, repeated as an
explicit gap in roughly half of the READMEs and issue trackers, is durable,
private, trustworthy **memory**, plus simple, honest **legibility** into what
an agent actually did and why. That gap is ReWoo's wedge.

## 3. Extracted Primitives

Twelve primitives recurred across independent authors strongly enough to
treat as validated patterns, not one-off inventions. For each: where it
showed up, why it exists, and how ReWoo reshapes it into a specific module.

**1. Goal/task lineage.** *Where:* Paperclip (ticket carries goal→project→
company mission), one-man-office, agentic-org. *Why:* agents lose the "why"
behind a step if it's not carried with the work. *ReWoo:* every task row in
SQLite (`rewoo/db.py`) is a first-class record with its prompt, helper,
profile and full event log; there's no separate "goal" object because ReWoo
has one user, not a company — the task *is* the goal. Full traceability comes
from the event log, not an org-chart lineage field.

**2. Tiered, budget-conscious memory.** *Where:* ClawCompany (4-layer:
session→archive→company→chairman prefs, ~400 tokens injected),
HubOS (3-layer self-evolving memory), OpenOffice (L0–L3 JSON memory),
ujjwalredd (durable + episodic-TTL + RAG). *Why:* dumping everything into
context is expensive, slow, and drowns the signal. *ReWoo:* the four
memory layers — Facts, Knowledge, Episodes, Working (`rewoo/memory/store.py`,
`rewoo/memory/context.py`) — are this same shape, but user-legible: Facts are
things the user explicitly approved, not an opaque LLM-compressed blob.
`ContextBuilder` packs items into a token budget, pinned facts first.

**3. Reflect-after-task → reusable lesson.** *Where:* HubOS's "Work
Experience v4" (candidate→approved→mature promotion), ChatDev's
"Experiential Co-Learning," jeturing/mission-control's dedicated "Learner"
role, aicompanyos's `self.jsonl`. *Why:* independent implementations of the
same idea validate it as high-confidence: continual improvement without
fine-tuning. *ReWoo:* every finished task is auto-saved as an Episode
(`rewoo/memory/store.py`, wired from `rewoo/agent/runtime.py` on task
completion) and becomes retrievable context for future tasks — reflection is
a side effect of finishing, not a separate role or pipeline stage.

**4. Model-agnostic / bring-your-own-provider.** *Where:* essentially every
repo surveyed (Paperclip, claw-empire, OpenOffice, HubOS, ClawCompany,
agency-swarm, openclaw, agent-zero, OpenHands, office-of-mh) — and ChatDev's
top issue by far (59 comments) is "local model support." *Why:* users don't
want to be locked to one vendor's pricing or privacy posture; it's table
stakes for this whole category, not a differentiator. *ReWoo:* one
`ModelProvider` abstract interface (`rewoo/models/base.py`) with adapters
(`rewoo/models/adapters.py`) for OpenAI-compatible endpoints (OpenAI,
OpenRouter, Groq, LM Studio, vLLM), Anthropic, Gemini, and Ollama, plus an
offline `DemoProvider` (`rewoo/models/demo.py`) so the product works with
zero API key on first run — directly answering the "local model support"
demand and the onboarding-friction gap at once.

**5. Portable action protocol instead of vendor function-calling.**
*Where:* getlatentic/agent-harness's normalized `RunEvent` stream across
heterogeneous CLIs, open-harness's typed event stream, OpenHands' Agent
Client Protocol — all solve "every backend has its own incompatible tool
format" by picking one internal shape. *Why:* per-provider adapter
maintenance is a named, repeated pain point (OpenOffice's and claw-empire's
capability matrices). *ReWoo:* rather than relying on each vendor's native
function-calling schema, `rewoo/agent/protocol.py` asks every model for one
JSON object per turn and parses it forgivingly (code fences, stray text,
trailing commas) — this is what actually lets Anthropic, OpenAI, Gemini,
Ollama and tiny local models drive the identical agent loop.

**6. Fallback chains with visible brain-switching.** *Where:* implicit in
every multi-provider system, made explicit as a router concern in
OpenHands ("switch backends without losing focus") and openclaw's
plugin-swappable model harnesses. *Why:* providers fail (timeouts, 429s,
outages) and users want continuity, not a crash. *ReWoo:*
`rewoo/models/router.py` tries the default provider then a fallback chain on
retryable errors, and emits a `brain_switch` event so the UI can say
"Switched to backup brain" — visibility, not silent failover.

**7. Privacy-aware routing (some data never leaves the device).**
*Where:* openclaw's "trusted gateway, untrusted execution" / "your hardware,
your data" trust framing; mission-control's explicit "Privacy First, no
analytics" as a stated differentiator; agent-zero's per-project secrets
isolation. *Why:* users evaluating this category are explicitly anxious
about telemetry and data leaving their machine. *ReWoo:* the router's
routing rules (`rewoo/models/router.py`) put profile `"private"` and any
context sourced from a source marked private on local-only providers
(Ollama, Demo) — never sent to a remote brain, enforced in code, not policy.
The `Hush` helper (`rewoo/agent/helpers.py`) exposes this as a one-click
mode for non-technical users.

**8. Verification-before-completion / no self-approval on your own risky
action.** *Where:* the entire harness cluster converges here — jxiaow's
"scope→solution→build→close" gates requiring recorded evidence, SUNRNEHUI's
tiered Native/Portable/Audited process by risk, majiayu000's architecturally
forced separate implementer/reviewer agents, harness-kit's "audit → scored
report → approve one by one." *Why:* "I changed three files, it should work
now" without evidence is the single most-repeated complaint across the
harness cluster — users don't trust agent self-reports. *ReWoo:* tool risk
levels (`safe / external / memory / irreversible`, `rewoo/tools/registry.py`)
gate action, not code — the agent cannot silently do a memory-changing or
irreversible thing; it must pause for an approval event
(`approval_requested` / `approval_decided` in `rewoo/agent/runtime.py`), and
approval mode (cautious/balanced/autopilot) sets how much gets auto-approved.
Emails are drafted, never sent — the flagship instance of "fail closed on
claiming a real-world action happened."

**9. Hybrid retrieval over dumb single-signal search.** *Where:* implicit
in every "knowledge base" mentioned (ujjwalredd's RAG + ChromaDB,
open-harness's session compaction) but rarely made concrete; most repos just
say "vector DB" without justifying the choice. *Why:* keyword search alone
misses paraphrase; embeddings alone miss exact terms/names. *ReWoo:*
`rewoo/memory/store.py` fuses SQLite FTS5 BM25 keyword ranking with vector
similarity (a local hashing embedder by default, or a real provider
embedding model) via Reciprocal Rank Fusion — no external vector database
required, keeping the "one file, zero servers" (`rewoo/db.py`) promise.

**10. A visible receipt of what context/memory was actually used.**
*Where:* the entire event-bus-as-UI-contract pattern (open-harness, mission
control's Live Feed, aicompanyos's dual terminal+web dashboard fed by one
event bus, pixel-office's speech bubbles) — separate "what happened" from
"how it's shown." *Why:* "what is my agent doing right now" is named as an
explicit unmet feature request even in mature, heavily tooled projects
(ChatDev). *ReWoo:* `rewoo/memory/context.py`'s `ContextBuilder` returns not
just a numbered context block but a **context receipt** — what was used,
what was left out and why, how many secrets were redacted — persisted as a
`context` event (`rewoo/events.py`) and shown in the UI as "What I'm using."
The whole event log doubles as a replay trace (`rewoo/harness/replay.py`).

**11. Restart-safe durability for anything running in the background.**
*Where:* the single most common maintenance complaint in the survey —
Paperclip's heartbeat races and "recovery after cancellation" bugs, agent-
zero's history-file bloat causing crashes, openclaw's follow-up queues not
surviving gateway restarts. *Why:* background/async agent work needs state
that survives a crash or restart, not just a chat scrollback. *ReWoo:*
every step is written as an event to SQLite before it's pushed to
subscribers (`rewoo/events.py`); tasks interrupted by a restart are marked
`interrupted` rather than silently lost (`rewoo/agent/runtime.py`). One
SQLite file, no daemon, no separate message broker to keep in sync.

**12. Helpers as scoped roles, not a corporate org chart.** *Where:*
agency-swarm's directional `communication_flows`, ChatDev's fixed agent
pairs, the near-universal "CEO/CTO/PM" role vocabulary across the
AI-company cluster. *Why:* specialized roles with scoped tools genuinely
reduce hallucinated tool calls and make delegation predictable — but the
corporate framing (departments, budgets, headcount) is the wrong metaphor
for a single person's day. *ReWoo:* `rewoo/agent/helpers.py` keeps the
useful part — a name, personality, a fixed tool subset, and a privacy
profile — and drops everything else. Five helpers ship: Woo (generalist),
Scout (research, web_fetch + read_document), Quill (drafts, never sends),
Tally (numbers/todos, forced through the calculator tool), Hush (private-
profile only). `ask_helper` allows one level of delegation (depth 1) so Woo
can hand off part of a task, without recursion or a hierarchy to configure.

## 4. What ReWoo Deliberately Rejects, and Why

- **The corporate org-chart metaphor** (CEO/CTO/departments/headcount/
  budgets-as-company-spend) — used by Paperclip, ClawCompany, agentic-org,
  HubOS, mishrasanjeev/agentic-org, aicompanyos, Node-Features/company-os,
  ChatDev's original ChatChain. This is a personal tool for one person's day,
  not a simulated company; the metaphor adds ceremony (roles to configure,
  meetings to hold) that a non-technical user has to learn before getting
  value. ReWoo keeps scoped-role delegation (helpers) and throws away the
  employee/department framing entirely.
- **Docker-first / container-baseline setup** — agent-zero's Dockerized
  desktop as the "quick start," several harness repos assuming a
  git-worktree-per-task workflow. Requiring a container runtime raises the
  bar for exactly the non-technical audience ReWoo targets. ReWoo is a
  Python package with SQLite; `python -m rewoo` works with zero external
  services.
- **Host-access-by-default with sandboxing as opt-in** — openclaw and
  OpenHands both explicitly flag this as their own risky default ("tools run
  on host unless configured otherwise," "no-sandbox warns of full filesystem
  access"). ReWoo inverts it: the built-in tool set is deliberately narrow
  and safe-by-default (`rewoo/tools/builtin.py`), risk levels gate anything
  beyond read-only, and there is no shell/filesystem-execution tool shipped
  at all.
- **Decorative-only office/pixel-art visuals** — claw-empire, OpenOffice,
  pixel-office, office-of-mh, CompanyOS. AgentFleet's own README explicitly
  calls out that most competing pixel offices are "just cute, view-only."
  ReWoo's "Woo" mascot is a single friendly identity for the assistant, not a
  simulated building with walking sprites, meeting rooms, or a leaderboard —
  legibility comes from the event stream and context receipt, which are real
  state, not animation.
- **Heavy enterprise scope** — mishrasanjeev/agentic-org's tenant/RBAC/SCIM/
  SSO/Twilio-voice/OCR/RPA surface, majiayu000/harness's Postgres+OTLP+
  policy-engine stack, Node-Features/company-os's 20-domain governance
  architecture (7 of 20 domains admittedly unimplemented). These are built
  for organizations coordinating many people/agents at scale. A personal
  agent OS for one user's private data does not need multi-tenancy,
  SSO, or a policy DSL — ReWoo's three approval modes (cautious/balanced/
  autopilot) and four risk levels cover the real decision space at a
  fraction of the complexity.
- **Fully autonomous "zero human intervention" loops** — auto-co-meta's
  bash-loop company, ujjwalredd's "zero human intervention after setup."
  Appealing for shipping code unattended; wrong for a system that can touch
  a user's email drafts, files, and Drive contents. ReWoo's approval gates
  and privacy routing exist precisely to keep a human in the loop for
  anything consequential.

## 5. Gap Analysis

Reading the recurring-gaps sections across all three research groups against
what's actually built, a consistent shape emerges: **the orchestration layer
(getting an agent to plan, call tools, and produce an answer) is
comparatively solved** — nearly every repo surveyed has a working version of
this. What's missing, named again and again by different authors with no
apparent coordination, is a *narrower, harder* layer:

| Recurring pain (from issues/READMEs) | Missing layer |
|---|---|
| "Local model support" is the #1 requested feature (ChatDev, 59 comments); agent-zero users can't get local LLMs working | **Model freedom** — genuine multi-provider support that isn't an afterthought bolted on the OpenAI-native path |
| "What is my agent doing right now" requested even in mature, well-tooled projects; office-of-mh/AgentFleet visuals critiqued as decoration without substance | **Legibility** — real state (what was used, what was decided, what's pending) surfaced simply, not performed |
| Memory/knowledge listed as still-unbuilt on the most mature roadmap (Paperclip); memory bloat crashing agent-zero at ~127MB; nobody has shipped RLS/security policies for personal data access (CompanyOS) | **Private, durable memory with real access boundaries** — not a vector-DB afterthought, and not something that silently grows unbounded |
| "Agent says 'should work now' without showing what was verified" echoed across nearly every harness repo; approval flows repeatedly buggy (openclaw's 165-comment approval-hang issue) | **Consent** — a simple, robust approval mechanism the user actually trusts, scaled to the risk of the action |
| Onboarding (Docker, `.env`, terminal comfort) dominates support load even in projects explicitly targeting "everyone" | **Zero-setup first run** — a working product before any configuration |

**Thesis:** infrastructure — the plan/act/observe loop, tool calling,
multi-provider adapters — is a solved problem that this category has
re-implemented dozens of times with only cosmetic variation. The actual
unmet need, visible as a gap in nearly every research note across all three
groups, is a **legibility + consent + private-memory + model-freedom layer
built for a normal person**, not a developer or an enterprise. That is
ReWoo's bet: don't compete on orchestration novelty; compete on making the
already-solved orchestration loop trustworthy and understandable for someone
who has never heard the word "agent."

## 6. Research → Architecture Map

| Gap identified in research | ReWoo mechanism | File / module |
|---|---|---|
| Local/open model support is the #1 cross-repo request | `ModelProvider` interface + OpenAI-compat/Anthropic/Gemini/Ollama adapters + offline Demo brain | `rewoo/models/base.py`, `rewoo/models/adapters.py`, `rewoo/models/demo.py` |
| Per-provider function-calling incompatibility is a named maintenance burden | One portable JSON action protocol instead of vendor tool-calling schemas | `rewoo/agent/protocol.py` |
| "What is my agent doing" is chronically unsolved even in mature projects | Every step is an event; SSE live stream; trace replay | `rewoo/events.py`, `rewoo/api/app.py`, `rewoo/harness/replay.py` |
| Memory is unbuilt/bolted-on almost everywhere; tiered memory (session/archive/company/prefs) recurs independently across 4+ repos | Four-layer memory (Facts/Knowledge/Episodes/Working) + hybrid BM25+embedding retrieval | `rewoo/memory/store.py`, `rewoo/memory/text.py` |
| No one shows *why* an answer used the context it used | Per-task context receipt (used / left out / redacted) | `rewoo/memory/context.py` |
| Users don't trust agent self-reports of "done"/"sent" | Risk-leveled tools, approval gates by mode, drafts-never-sends for email | `rewoo/tools/registry.py`, `rewoo/agent/runtime.py`, `rewoo/agent/helpers.py` (Quill) |
| Users are anxious about data leaving their machine (openclaw, mission-control) | Privacy-aware routing: private sources/profile forced to local-only providers | `rewoo/models/router.py`, `rewoo/agent/helpers.py` (Hush) |
| Read access to personal files (Drive) needs a strict, honest boundary | Read-only OAuth scope, user-chosen folders, incremental sync by modifiedTime+hash, deletions removed | `rewoo/connectors/gdrive.py` |
| Reflect-after-task → reusable lesson recurs across HubOS/ChatDev/mission-control independently | Finished tasks auto-saved as Episodes, retrievable in future context | `rewoo/memory/store.py`, wired in `rewoo/agent/runtime.py` |
| Restart/crash losing in-flight background work is the top maintenance sink (Paperclip, openclaw) | Event-sourced SQLite log; interrupted tasks marked, not lost | `rewoo/db.py`, `rewoo/events.py`, `rewoo/agent/runtime.py` |
| Corporate org-chart metaphor is over-engineered for one person; scoped roles are still useful | Helpers: name + personality + fixed tool subset + privacy profile, one-level delegation | `rewoo/agent/helpers.py` |
| Onboarding friction (Docker/.env/terminal) dominates support load everywhere | Zero-setup: SQLite, no external services, offline Demo brain works out of the box | `rewoo/config.py`, `rewoo/models/demo.py`, `rewoo/__main__.py` |
| Users want a fast on-ramp without configuring from scratch (templates/office-packs recur) | Recipes: one-click JSON workflow templates | `rewoo/recipes/` |
| Nobody proves memory/process changes actually help ("can't prove agents make fewer mistakes" — harness-starter-kit) | JSON eval scenarios (grounding, honesty, consent, privacy, redaction, math, drafts-not-sends) + CI | `rewoo/harness/runner.py`, `.github/` |

## 7. Open Questions / Roadmap

These are informed directly by gaps the research kept surfacing that ReWoo
has not yet built:

- **Scheduling / heartbeats.** Paperclip's heartbeat pattern (DB-backed
  wakeup queue, atomic checkout) is the cleanest version of "run this
  periodically without double-work" seen in the survey. ReWoo has no
  background scheduler yet — recipes and tasks are user-triggered. A
  restart-safe heartbeat table would let ReWoo do things like "check my
  Drive folder every morning" without a cron job outside the app.
- **More connectors.** Google Drive is the only external memory source
  today. The read-only, incremental, user-chosen-folder pattern in
  `rewoo/connectors/gdrive.py` generalizes cleanly to email (read-only),
  calendar, and local folders — same sync-by-hash, same redaction rules.
- **MCP tool import.** Several repos (Ancienttwo/repo-harness, getlatentic/
  agent-harness) expose or consume tools via MCP. ReWoo's tool registry
  (`rewoo/tools/registry.py`) already separates risk/label metadata from
  execution; an MCP-to-`Tool` adapter is a plausible bridge without changing
  the risk/approval model.
- **Lessons extraction beyond raw episodes.** Today an Episode is the raw
  question/answer pair. HubOS's "Work Experience v4" (candidate → approved →
  mature promotion) and mission-control's dedicated Learner role suggest a
  next step: periodically distill episodes into a smaller number of durable,
  named lessons — but this must stay user-visible and reversible, not an
  opaque compression step (the ClawCompany failure mode this research
  flagged).
- **Multi-device.** Nothing in the current architecture assumes a second
  device; SQLite is single-file, single-machine. If a future mobile
  companion is wanted (HubOS and OpenOffice both cite this as unmet
  aspiration), the event log's replay-friendly shape is the natural sync
  primitive — but this is unscoped today, not partially built.
- **Verification evidence for consequential actions.** The harness cluster's
  strongest recurring idea — don't accept an agent's unverified "it worked"
  — is only partially present in ReWoo today (approval gates cover *before*
  an action; there's no structured *after-the-fact* verification record).
  Worth revisiting once ReWoo grows tools with real external side effects.

## 8. Appendix: Per-Repo One-Liners

Grouped by the 7 clusters from Section 2. License field reflects what was
found at `HEAD`; "none found" means no LICENSE file was located.

### AI-company simulators
| Repo | License | Key idea | What ReWoo took |
|---|---|---|---|
| paperclipai/paperclip | MIT | Ticket carries full goal lineage; DB-backed heartbeat with atomic checkout | Every task keeps its own event log for traceability (not a lineage field) |
| Claw-Company/clawcompany | MIT | 4-layer memory (session/archive/company/chairman), token-budget-conscious | Tiered memory shape → Facts/Knowledge/Episodes/Working |
| GreenSheep01201/claw-empire | Apache-2.0 | Pixel-art office; swappable "Office Pack" workflow topologies | Rejected the visual metaphor; kept "swap the workflow, not the whole app" via Recipes |
| ufuksamet0/autonomous-company-os | Apache-2.0 | Thin org-engine layer atop a Task/Run/MCP substrate; retry/escalation within boundaries | Retry/fallback-with-visibility idea → Router's fallback chain |
| mishrasanjeev/agentic-org | Apache-2.0 | "Implemented vs. configuration-dependent vs. non-goal" documentation discipline; fail-closed action boundary | Fail-closed pattern → drafts, never sends |
| hubos-ai/HubOS | Apache-2.0 | 3-layer self-evolving memory; reflect-after-task lesson cards; per-file locking | Reflect-after-task → Episodes auto-saved on completion |
| aicompanyos (lora-sys) | none found | Never-degrade rule; ranked stop-policy (Guard>Quality>Degradation>Max>Timeout); dual terminal+web dashboard on one event bus | Stop-policy discipline informs runtime budgets; one event bus → SSE + trace replay |
| Autonomous-AI-Company-OS (ujjwalredd) | none found | 3-tier memory (durable/episodic-TTL/RAG); reward/correction prompt injection | Durable+episodic+retrieval split → memory layers |
| Node-Features/company-os | none found (pre-alpha) | Governance-as-first-class-layer, separate from execution | Confirms: ship simple approval modes, not a governance DSL |

### Pixel-office / spatial visualizers
| Repo | License | Key idea | What ReWoo took |
|---|---|---|---|
| longyangxi/OpenOffice | MIT | Auto-detects any installed coding CLI as backend; 4-layer JSON memory; typed event contracts | Typed event stream as UI contract → `rewoo/events.py` |
| DBell-workshop/AgentFleet | BSL 1.1 (→Apache 2030) | "Scene" = isolated agent+context+chat bundle; desktop-pet ambient status; critiques decorative-only competitors | Validated: legibility must be tied to real state, not decoration |
| piraminet/pixel-office | none found (assets restrictively licensed) | Decouples dumb pixel renderer from any backend via REST API; speech bubbles for current action | Separation of "what happened" from "how it's shown" → events vs. UI |
| mholovetskyi/office-of-mh | Apache-2.0 (fork of claw-empire) | Gamification tied to real cost/duration metrics, not decorative | Confirms: playful only works when backed by real state |
| FREEDOMVIKING/CompanyOS | none found (stub) | Aspirational dashboard vocabulary, nothing built | Cautionary example: document only what exists |

### Chat-native gateways
| Repo | License | Key idea | What ReWoo took |
|---|---|---|---|
| openclaw/openclaw | MIT | Always-on Gateway daemon; every surface is a client; "your hardware, your data" trust framing; pairing/approval for unknown senders | Privacy-first framing → private-profile routing; approval-gate concept |
| hubos-ai/HubOS (channel layer) | Apache-2.0 | 14+ chat channels, one message format | Not adopted directly (scope); informs future multi-surface thinking |

### Coding-agent harnesses / process disciplines
| Repo | License | Key idea | What ReWoo took |
|---|---|---|---|
| deepklarity/harness-kit | MIT | Audit → scored report → approve adoptions one by one | Trust-building "approve one by one" → approval gates per risky action |
| The-Syntax-Slayer/repository-harness | MIT | Durable decision log replaces chat-history-only memory | Durable state over ephemeral chat → Episodes + Facts, not scrollback |
| Ancienttwo/repo-harness | MIT | Authorized programs: pre-approved budget/scope, visible control board | Approval modes (cautious/balanced/autopilot) as the lightweight analog |
| getlatentic/agent-harness | none found | Single normalized event stream (`RunEvent`) across heterogeneous CLIs; discovery not installation | Normalized event schema → `rewoo/events.py`; "don't install without asking" ethos |
| majiayu000/harness | MIT | Architecturally forced separate implementer/reviewer; policy-as-sandboxed-code | Risk-level gating instead of a full policy engine |
| jxiaow/agent-harness | MIT | Stage gates requiring recorded verification, not self-report | "Don't trust the agent's self-report" → approval events before risky tools run |
| SUNRNEHUI/agent-harness | MIT | Tiered process by risk (Native/Portable/Audited) | Direct analog: tool risk levels (safe/external/memory/irreversible) |
| harnessworks/harness-starter-kit | MIT | Converts recurring failures into durable artifacts; admits it can't prove effectiveness | Motivates eval harness as an honest, separate measurement layer |
| agaleraib/claude-harness | none found | Lazy-load context to keep startup tiny; simple dependency-free "Second Brain" session API | ContextBuilder's per-task, budget-aware packing (not always-loaded bloat) |
| MaxGfeller/open-harness | MIT | Composable middleware (compaction/retry) on a typed event stream; model-agnostic by construction | Event-stream-as-contract pattern |

### Multi-agent SDKs / frameworks
| Repo | License | Key idea | What ReWoo took |
|---|---|---|---|
| VRSEN/agency-swarm | MIT | Typed, validated tool schemas reduce hallucinated calls; directional communication_flows | Fixed tool subset per helper (not a full graph config) |
| HKUDS/AutoAgent | MIT | "User mode" ready-to-use agent before any configuration | Demo brain works with zero setup, zero API key |
| FoundationAgents/MetaGPT | MIT | Roles produce/consume typed artifacts (PRD→design→code) instead of free-form chat | Informs Recipes as structured, repeatable workflow templates |
| OpenBMB/ChatDev | Apache-2.0 | "Seminar" structured critique-and-revise dialogue; Experiential Co-Learning | Reflect-after-task pattern (independent confirmation) |

### General-purpose local agent runtimes
| Repo | License | Key idea | What ReWoo took |
|---|---|---|---|
| agent0ai/agent-zero | MIT | Per-project isolation of memory/secrets; Docker-baseline desktop; live cowork on documents | Per-source privacy isolation (private sources → local-only brains) |
| OpenHands/OpenHands | MIT | Agent-and-backend-agnostic client-server protocol; switch backends without losing context | Model-agnostic core design validated at platform scale |
| jeturing/mission-control | MIT | Kanban lifecycle as legibility; dedicated "Learner" role; explicit Privacy First stance | Kanban-simple legibility validates plain status over spatial UI; privacy-first stance |
| chcosta/TheOffice.AI | Private (not OSS) | Zero-friction desktop packaging (server+SPA, no admin rights); live dev cards | "Just getting it installed" is the real bottleneck → zero-setup design goal |

## Sources

Repo names, licenses, and quoted feature claims are drawn from
`/agent/workspace/research/notes_A.md`, `notes_B.md`, and `notes_C.md`
(36-repo README/LICENSE/issue survey, methodology described in Section 1 of
each file).
