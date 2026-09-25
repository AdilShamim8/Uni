# Attribution

## Statement

ReWoo is an **independent implementation**, written from scratch by Adil
Shamim. As part of designing it, 36 open-source "AI agent" repositories were
studied for *ideas* — architectural patterns, recurring pain points, and
design lessons — as documented in `RESEARCH.md`.

**No source code, assets, branding, or UI from any of the repos below was
copied, translated, or vendored into ReWoo.** Where a repo is licensed under
terms that would require attribution or share-alike obligations if code were
reused (AGPL-3.0, BSL 1.1, or repos with no discoverable license at all),
ReWoo treats that repo as **ideas-only, non-derivative** input: concepts and
lessons were absorbed and reimplemented independently in ReWoo's own code
and words, and no license obligation from the source repo attaches to
ReWoo as a result. This document exists so that claim is auditable — every
repo consulted is listed with the license found at the time of research.

Mascot ("Woo"), helper names (Woo, Scout, Quill, Tally, Hush), UI copy, and
all code under `rewoo/` are original to this project.

## Studied Repositories (36)

License as found at `HEAD` via `raw.githubusercontent.com` during research
(see `RESEARCH.md`, Section 1, for method). "none found" = no LICENSE file
located at HEAD; "unavailable" = repo/page could not be resolved as
documented (404) but is listed for completeness because it was cited in the
research notes.

| # | Repo | URL | License found |
|---|---|---|---|
| 1 | paperclipai/paperclip | https://github.com/paperclipai/paperclip | MIT |
| 2 | Claw-Company/clawcompany | https://github.com/Claw-Company/clawcompany | MIT |
| 3 | GreenSheep01201/claw-empire | https://github.com/GreenSheep01201/claw-empire | Apache-2.0 |
| 4 | NikitaDmitrieff/auto-co-meta | https://github.com/NikitaDmitrieff/auto-co-meta | MIT |
| 5 | scolastico-dev/one-man-office | https://github.com/scolastico-dev/one-man-office | AGPL-3.0-or-later |
| 6 | bipinks/ghost-office | https://github.com/bipinks/ghost-office | MIT |
| 7 | ufuksamet0/autonomous-company-os | https://github.com/ufuksamet0/autonomous-company-os | Apache-2.0 (fork/extension of elie222/rakazo) |
| 8 | mishrasanjeev/agentic-org | https://github.com/mishrasanjeev/agentic-org | Apache-2.0 |
| 9 | hubos-ai/HubOS | https://github.com/hubos-ai/HubOS | Apache-2.0 |
| 10 | longyangxi/OpenOffice | https://github.com/longyangxi/OpenOffice | MIT |
| 11 | FoundationAgents/MetaGPT | https://github.com/FoundationAgents/MetaGPT | MIT |
| 12 | OpenBMB/ChatDev | https://github.com/OpenBMB/ChatDev | Apache-2.0 |
| 13 | VRSEN/agency-swarm | https://github.com/VRSEN/agency-swarm | MIT |
| 14 | HKUDS/AutoAgent | https://github.com/HKUDS/AutoAgent | MIT |
| 15 | openclaw/openclaw | https://github.com/openclaw/openclaw | MIT |
| 16 | agent0ai/agent-zero | https://github.com/agent0ai/agent-zero | MIT |
| 17 | OpenHands/OpenHands | https://github.com/OpenHands/OpenHands | MIT |
| 18 | deepklarity/harness-kit | https://github.com/deepklarity/harness-kit | MIT |
| 19 | The-Syntax-Slayer/repository-harness | https://github.com/The-Syntax-Slayer/repository-harness | MIT |
| 20 | Ancienttwo/repo-harness | https://github.com/Ancienttwo/repo-harness | MIT |
| 21 | getlatentic/agent-harness | https://github.com/getlatentic/agent-harness | none found |
| 22 | majiayu000/harness | https://github.com/majiayu000/harness | MIT |
| 23 | jxiaow/agent-harness | https://github.com/jxiaow/agent-harness | MIT |
| 24 | SUNRNEHUI/agent-harness | https://github.com/SUNRNEHUI/agent-harness | MIT |
| 25 | MaxGfeller/open-harness | https://github.com/MaxGfeller/open-harness | MIT |
| 26 | harnessworks/harness-starter-kit | https://github.com/harnessworks/harness-starter-kit | MIT |
| 27 | agaleraib/claude-harness | https://github.com/agaleraib/claude-harness | none found (no LICENSE file at HEAD) |
| 28 | DBell-workshop/AgentFleet | https://github.com/DBell-workshop/AgentFleet | Business Source License 1.1 (converts to Apache-2.0 in 2030) |
| 29 | chcosta/TheOffice.AI | https://github.com/chcosta/TheOffice.AI | Private — internal use only (explicitly not open source) |
| 30 | piraminet/pixel-office | https://github.com/piraminet/pixel-office | none found (no LICENSE file at HEAD); bundled sprite/tileset assets carry separate third-party (itch.io) licenses |
| 31 | jeturing/mission-control | https://github.com/jeturing/mission-control | MIT |
| 32 | mholovetskyi/office-of-mh | https://github.com/mholovetskyi/office-of-mh | Apache-2.0 (fork of GreenSheep01201/claw-empire) |
| 33 | FREEDOMVIKING/CompanyOS | https://github.com/FREEDOMVIKING/CompanyOS | none found (no LICENSE file at HEAD) |
| 34 | lora-sys/aicompanyos | https://github.com/lora-sys/aicompanyos | none found (no LICENSE file at HEAD) |
| 35 | ujjwalredd/Autonomous-AI-Company-Operating-System | https://github.com/ujjwalredd/Autonomous-AI-Company-Operating-System | none found (no LICENSE file at HEAD) |
| 36 | Node-Features/company-os | https://github.com/Node-Features/company-os | none found (no LICENSE file at HEAD); repo self-labeled "pre-alpha" |

**Note on AGPL / BSL / unlicensed repos:** rows 5 (AGPL-3.0-or-later), 28
(BSL 1.1), and every row marked "none found" / "unavailable" (21, 27, 30,
33, 34, 35, 36) were consulted **for ideas only** — architectural concepts
described in their own README prose, not their source code. ReWoo does not
distribute, link against, or derive code from any of these repositories, so
none of their license terms (including AGPL's copyleft or BSL's delayed-open
terms) apply to ReWoo.

## Runtime Dependencies and Their Licenses

| Dependency | License | Role |
|---|---|---|
| FastAPI | MIT | HTTP API framework |
| Uvicorn | BSD-3-Clause | ASGI server |
| httpx | BSD-3-Clause | Async HTTP client (model provider adapters, Google Drive REST calls) |
| Pydantic | MIT | Request/response validation in the API layer |
| python-multipart | Apache-2.0 | Multipart form parsing (file uploads) |
| pypdf | BSD-3-Clause | PDF text extraction (optional dependency) |

SQLite (Python standard library `sqlite3`) is public domain and ships with
CPython; it is not a separate dependency to license.

PyYAML is **not used** by ReWoo.

## Fonts

The web UI loads Google Fonts **"Fredoka"** and **"Nunito"** from the Google
Fonts CDN. Both are licensed under the **SIL Open Font License 1.1**.
