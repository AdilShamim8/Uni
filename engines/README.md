# engines/ — vendored upstream agent systems

ReWoo merges three open-source projects into one product. Their **complete, unmodified
source trees** are included here so you can read, build, run and study them offline, and so
ReWoo's adapters can be verified against the exact code they target.

| Folder | Project | Pinned snapshot | License |
|---|---|---|---|
| `engines/hermes-agent/` | [Hermes Agent](https://github.com/NousResearch/hermes-agent) | `fdec926ef543` (main, 2026-09-25) | MIT — Copyright (c) 2025 Nous Research |
| `engines/paperclip/` | [Paperclip](https://github.com/paperclipai/paperclip) | `efce9356b553` (master, 2026-09-25) | MIT — Copyright (c) 2025 Paperclip AI |
| `engines/openclaw/` | [OpenClaw](https://github.com/openclaw/openclaw) | `364f1ddf3b66` (main, 2026-09-25) | MIT — Copyright (c) 2026 OpenClaw Foundation |

## What each one brings to ReWoo

| Engine | The idea ReWoo uses | How it plugs in |
|---|---|---|
| **Paperclip** | *The team*: an AI company with org chart, goals, budgets, heartbeats and tickets ("cases"). | Paperclip's built-in `http` adapter sends heartbeats to `POST /api/paperclip/heartbeat`, so a ReWoo Bot can be **hired** into your Paperclip company. ReWoo also reads agents/cases via Paperclip's REST API. Routines + the scheduler in ReWoo are the personal-scale version of heartbeats. |
| **Hermes Agent** | *The learning*: a closed loop that turns experience into reusable `SKILL.md` skills. | Any ReWoo Bot can use **engine = hermes** (talks to Hermes' OpenAI-compatible API server on :8642, or runs `hermes chat -q … -Q`). ReWoo's own skill loop writes the same `SKILL.md` format and can import the 200+ skills bundled here (Skills → *Import Hermes library*). Hermes can also use ReWoo as a model (`custom_providers`). |
| **OpenClaw** | *Works where you work*: one gateway, 20+ chat apps (WhatsApp, Telegram, Slack, Discord, Signal, iMessage…), DM pairing. | Any ReWoo Bot can use **engine = openclaw** (gateway `/v1/chat/completions`, `model: openclaw/<agent>`). OpenClaw can use ReWoo Bots as its model provider, so every chat app reaches ReWoo's private memory + consent gates. ReWoo's native Telegram channel borrows the pairing idea. |

## Running them

They are **optional**. ReWoo works on its own with one command (`python -m rewoo`).

```bash
# Hermes Agent (Python 3.11+)
pip install hermes-agent            # or: cd engines/hermes-agent && pip install -e .
hermes setup                        # pick a model / provider
API_SERVER_KEY=$(openssl rand -hex 32) hermes gateway   # enable the api_server platform (see its docs)

# Paperclip (Node 24.11+)
npx paperclipai test-drive          # or: cd engines/paperclip && pnpm install && pnpm dev   → http://localhost:3100

# OpenClaw (Node 24.16+)
npm install -g openclaw@latest      # or: cd engines/openclaw && pnpm install && pnpm build
openclaw onboard && openclaw gateway   # → ws/http on :18789
```

Then open ReWoo → **Connections → Engines**, enter the URL + key/token, and press *Save & test*.
Copy-paste configs for the reverse direction (engine → ReWoo) are shown on the same screen and
in [`docs/ENGINES.md`](../docs/ENGINES.md).

## Modifications

The trees are copies of the pinned GitHub snapshots **except** for the following changes:

- 3 symbolic links under `.claude/` (editor/agent configuration: `openclaw/.claude/skills`,
  `paperclip/.claude/skills/paperclip`, `paperclip/.claude/skills/company-creator`) were removed,
  because symlinks break ZIP extraction on Windows.
- `openclaw/apps/macos/Tests/OpenClawIPCTests/GatewayTLSStoreFixture.swift` was a symlink to
  `apps/shared/OpenClawKit/Tests/OpenClawKitTests/GatewayTLSStoreFixture.swift`; it is now a
  regular copy of that file.

- **Removed third-party material that had no redistribution license** (each folder now holds a README
  explaining the removal and where to get the originals):
  - `hermes-agent/web/public/fonts/`: 7 commercial font files (Collapse, Rules Compressed/Expanded by
    Blaze Type; Mondwest by Pangram Pangram Foundry), all marked "All rights reserved".
  - `hermes-agent/optional-skills/research/research-paper-writing/templates/`: conference LaTeX kits
    (AAAI, ACL, COLM, ICLR, ICML, NeurIPS style files and example PDFs) owned by the conference organisers.
  - `hermes-agent/tools/neutts_samples/jo.wav` and `jo.txt`: a recording of a person's voice from
    Neuphonic's NeuTTS samples, now under the custom NeuTTS Open License.
- **Added license texts that upstream didn't ship next to the files:** `JetBrainsMono-OFL.txt` (SIL OFL 1.1)
  in `hermes-agent/apps/desktop/src/fonts/` and `hermes-agent/web/public/fonts-terminal/`.

Git metadata (history) is not included. To update a snapshot, replace the folder with a newer
release and update the table above.

## Licenses

Each folder keeps its own `LICENSE` plus every nested license/notice file (fonts, icons, bundled
skills, third-party code). The root notices are reproduced in
[`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md). All are permissive (MIT, plus a few
Apache-2.0 sub-components). ReWoo itself is Apache-2.0.
