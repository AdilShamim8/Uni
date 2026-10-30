<div align="center">

# ✨ Uni

**A free, open-source AI workspace — bring your own key, keep your own data.**

Chat with GPT, Claude, Gemini, Grok, DeepSeek, Llama, and hundreds more —
through one honest interface that costs **$0** and runs from your browser.

[![CI](https://github.com/AdilShamim8/Uni/actions/workflows/ci.yml/badge.svg)](https://github.com/AdilShamim8/Uni/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-8b5cf6.svg)](frontend/LICENSE)
[![Frontend tests](https://img.shields.io/badge/tests-339%20frontend%20%2B%20117%20backend-10b981.svg)](#%EF%B8%8F-architecture)

[Live demo](https://universe-mu-two.vercel.app/) · [Quick start](#-quick-start-3-commands) · [Connect a provider](#-connect-your-first-provider-step-by-step) · [The 100% free path](#-the-100-free-path)

<img src="docs/screenshots/desktop-light-home.png" alt="Uni home screen — a clean chat interface with a sidebar of conversations and a large message box" width="860">

</div>

---

## 🧭 What is Uni?

Uni is an **independent, open-source AI workspace**. Instead of paying for a
premium chat subscription, you connect your own API keys — from OpenAI,
Anthropic, OpenRouter, Google, Groq, DeepSeek, or any OpenAI-compatible
endpoint (including local models like Ollama and LM Studio) — and Uni becomes
your premium chat product.

**Why people use it:**

- 💸 **Free forever.** Uni itself costs nothing and locks nothing behind a
  paywall. Several providers have free tiers, so the whole stack can run at
  zero cost.
- 🔑 **Your keys, your data.** In local mode everything — conversations,
  settings, and API keys — stays in **your browser**. Keys are never uploaded,
  never exported, and sent only to the provider endpoint you configure.
- 🧩 **Provider-independent.** Start on OpenAI, switch to Claude, try a free
  model on OpenRouter, then settle on a local Llama — same app, same
  conversations.
- 🪞 **Honest by design.** Anything simulated is labeled as simulated. If a
  connection test cannot prove your key works, it says so.

**The five destinations:**

| Destination | What it does |
| --- | --- |
| **Chat** | Branched conversations with any model: message tree, sibling variants, streamed replies, export. |
| **Work** | Describe an outcome; a task thread runs, asks inline questions, produces output you refine. |
| **Agents** | Persistent AI employees with memory notes, assigned work, and their own conversations. |
| **Plugins** | Local tools (documents, data analysis, library context) with per-thread grants and receipts. |
| **Library** | A shared collection of artifacts and lightweight projects with immutable versions. |

---

## 🎬 A 60-second tour (with pictures)

Never used Uni before? This is everything you'll see, in the order you'll
meet it. Every picture below is the real app — running in **demo mode**,
which works instantly with no account and no key.

### 1 · Home — where every conversation starts

The left sidebar holds your chats and the four other destinations. The big
box in the middle is where you type. That's it — you already know how to
use this part.

<img src="docs/screenshots/tour/home-light.png" alt="Uni home screen: a sidebar of past chats on the left, and a large message box in the middle asking What would you like to create?" width="820">

### 2 · Chat — talk to any model, branch any answer

Type a message, get a streamed reply. Want a different take? **Branch**
the conversation and try another model on the same message — both versions
stay side by side. In this picture the reply comes from the clearly-labeled
demo adapter (no key needed); with a real provider connected you'd see a
green **LIVE** badge instead.

<img src="docs/screenshots/tour/chat-demo.png" alt="A Uni conversation: the user's question on the left, the streamed answer rendered with formatting on the right" width="820">

### 3 · Work — describe an outcome, not a prompt

Instead of chatting, tell Uni *what you want done*. A task thread runs
step by step, asks you inline questions when it's unsure, and produces an
output you can refine with follow-ups.

<img src="docs/screenshots/tour/work.png" alt="The Work page: a Describe an outcome box with Demo and AI draft modes, and a list of your recent tasks" width="820">

### 4 · Agents — AI employees that remember

Create a profile once (name, role, memory notes) and it stays. Assign it
work, grant it tools, and open its own conversation where it already knows
who it is. Building one? **Start from a template** — Deep Researcher, Code
Partner, Editor, Study Coach, and more fill the whole form in one tap, and
everything stays editable.

<img src="docs/screenshots/tour/agents.png" alt="The Agents page: a grid of AI employee cards, each with a name, description, and buttons to chat or assign work" width="820">

<img src="docs/screenshots/tour/agent-template-applied.png" alt="The New agent page: a row of one-tap template chips above the form, with the Deep Researcher template applied — name, description, instructions, and starters all filled in" width="820">

### 5 · Plugins — tools with permission slips

Documents, data analysis, and library context run as local tools. Each one
is granted per conversation, and every use leaves an honest receipt — no
silent tool calls.

<img src="docs/screenshots/tour/plugins.png" alt="The Plugins page: tool cards such as Documents and Data analysis, each with an Enable or Settings action" width="820">

### 6 · Library — your saved work, versioned

Anything worth keeping becomes an artifact with immutable versions:
working drafts, projects, and Canvas documents all live here, ready to be
reused by you, your agents, or a Work task.

<img src="docs/screenshots/tour/library.png" alt="The Library page: empty-state cards for Artifacts and Projects inviting you to create your first one" width="820">

### 7 · Connecting a real model — the only setup step

When you're ready for real AI: open **Settings → Providers & models →
Add provider profile** and tap a preset. Free-tier providers wear a green
**FREE** badge — OpenRouter, Groq, Google AI Studio, Mistral, GitHub
Models, and fully-local Ollama can all cost **$0**.

<img src="docs/screenshots/tour/add-provider.png" alt="The Add provider form: preset chips for OpenAI, Anthropic, OpenRouter, Groq, Google and more, with green FREE badges on free-tier providers" width="820">

Tap a preset (here **OpenRouter**) and the endpoint fills itself in —
then paste your key and press **Connect**. Uni tests the key honestly and
auto-discovers every model the endpoint offers.

<img src="docs/screenshots/tour/add-provider-openrouter.png" alt="The Add provider form with the OpenRouter preset selected: the base URL is prefilled and suggested model chips appear" width="820">

That's the whole product. The rest of this README goes deeper, one step
at a time.

---

## 📑 Table of contents

1. [What is Uni?](#-what-is-uni)
2. [A 60-second tour (with pictures)](#-a-60-second-tour-with-pictures) — *start here if you're new*
3. [Quick start (3 commands)](#-quick-start-3-commands)
4. [Connect your first provider (step by step)](#-connect-your-first-provider-step-by-step)
   - [OpenAI (GPT)](#1-openai--gpt) · [Anthropic (Claude)](#2-anthropic--claude) · [OpenRouter (hundreds of models)](#3-openrouter--hundreds-of-models) · [Google (Gemini)](#4-google--gemini-free-tier) · [Groq (free tier)](#5-groq--free-tier) · [DeepSeek](#6-deepseek) · [Local models (Ollama / LM Studio)](#7-local-models--ollama--lm-studio--100-free)
5. [The 100% free path](#-the-100-free-path)
6. [Settings reference](#%EF%B8%8F-settings-reference)
7. [Screenshots](#-screenshots)
8. [Architecture](#%EF%B8%8F-architecture)
9. [Full-stack development (backend)](#-full-stack-development-backend)
10. [Project structure](#-project-structure)
11. [Troubleshooting](#-troubleshooting)
12. [FAQ](#-faq)
13. [Keyboard shortcuts](#%EF%B8%8F-keyboard-shortcuts) · [Contributing](#-contributing)
14. [License & credits](#-license--credits)

---

## 🚀 Quick start (3 commands)

You need [Node.js 22+](https://nodejs.org) and nothing else — no database,
no Docker, no account. *(The app itself runs on Node 20+; Node 22 is
needed to run the test suite, which uses jsdom 30 → undici 8.)*

```bash
git clone https://github.com/AdilShamim8/Uni.git
cd Uni/frontend
npm install && npm run dev
```

Open **http://localhost:5173** — Uni starts instantly in **demo mode**:
every feature is explorable, and replies come from a clearly-labeled local
demo adapter that contacts no one. Connect a real provider (next section)
whenever you are ready.

> **Beginner note:** "demo mode" is not a trial — it is the same app with a
> simulated adapter. Your conversations, settings, and keys always stay in
> your own browser.

---

## 🔌 Connect your first provider (step by step)

The idea is simple: **you** get an API key from a provider, paste it into
Uni, and Uni streams real model replies straight from that provider to your
browser. Uni never sees your key.

The general flow for every provider:

1. Click your profile at the bottom of the sidebar → **Settings** →
   **Providers & models**.
2. Click **Add provider profile**.
3. Tap a one-tap preset (e.g. `OpenAI · GPT`) — the endpoint fills itself in.
4. *(Optional but recommended)* Tap a **suggested model** chip so you do not
   have to hunt for a model id.
5. Click **Add profile**, paste your API key in the **API key** field, and
   click **Connect**. Uni tests the key and auto-discovers the models the
   endpoint offers.
6. Pick a model in the top bar and start chatting. A green **Live** badge
   means real streamed replies.

<img src="docs/screenshots/desktop-light-presets.png" alt="The Add provider form: preset chips for OpenAI, Anthropic, OpenRouter, Grok and more, with green FREE badges on providers that offer a free tier" width="760">

Where the sections below say "get a key", they link to the provider's own
console. Most take under two minutes.

### 1. OpenAI · GPT

**Cost:** pay-as-you-go (cheap for `mini` models).

1. Go to <https://platform.openai.com/api-keys> and create a key
   (starts with `sk-`).
2. Add ~$5 credit at <https://platform.openai.com/settings/organization/billing>
   — `gpt-4o-mini` and friends cost fractions of a cent per conversation.
3. In Uni: **Settings → Providers & models → Add provider profile**.
4. Tap the **OpenAI · GPT** preset, tap a suggested model (e.g.
   **GPT-4o mini**), click **Add profile**.
5. Paste the key → **Connect**. You should see
   `Connected — N models available`, and the model list fills itself.

### 2. Anthropic · Claude

**Cost:** pay-as-you-go.

1. Create a key at <https://console.anthropic.com/settings/keys>
   (starts with `sk-ant-`).
2. Add credit at <https://console.anthropic.com/settings/billing>.
3. In Uni, tap the **Anthropic · Claude** preset — the provider type
   switches to Anthropic's native protocol automatically.
4. Add a suggested model (e.g. **Claude Sonnet 4.5**), save, paste the key,
   **Connect**.

> Anthropic requires one extra header for direct browser requests — Uni
> sends it for you, so Claude just works.

### 3. OpenRouter · hundreds of models

**Cost:** has **free models** (marked `:free`).

OpenRouter is one account for ~450 models from OpenAI, Anthropic, Google,
Meta, DeepSeek, Mistral, and more — including a rotating free tier.

1. Create a key at <https://openrouter.ai/settings/keys>.
2. In Uni, tap the **OpenRouter** preset. Suggested chips include real
   `free` models (e.g. `google/gemma-4-31b-it:free`) — add one or skip
   (discovery lists everything).
3. Save, paste the key, **Connect**. Uni verifies the key against
   OpenRouter's auth-protected endpoint and lists **free models first**.

> OpenRouter's model catalog is public, so a bad key would still "look
> connected" on other apps. Uni checks the key against `/key` and tells you
> the truth.

### 4. Google · Gemini (free tier)

**Cost:** **free tier** for personal use.

1. Open <https://aistudio.google.com/apikey> and click **Create API key**.
2. In Uni, tap the **Google AI Studio · Gemini** preset — it uses Google's
   OpenAI-compatible endpoint, so no extra setup.
3. Add a suggested model (e.g. **Gemini 3.8 Flash**), save, paste the key,
   **Connect**.

### 5. Groq · free tier

**Cost:** **free tier** with generous rate limits — the fastest free chat
you can get.

1. Create a key at <https://console.groq.com/keys>.
2. In Uni, tap the **Groq** preset. Suggestions include **GPT-OSS 120B**
   and Llama models hosted at extreme speed.
3. Save, paste the key, **Connect**.

### 6. DeepSeek

**Cost:** pay-as-you-go, very inexpensive.

1. Create a key at <https://platform.deepseek.com/api_keys>.
2. Tap the **DeepSeek** preset. The suggestions use DeepSeek's stable
   aliases (`deepseek-chat`, `deepseek-reasoner`) which always point at the
   current models — no id hunting needed.
3. Save, paste the key, **Connect**.

### 7. Local models · Ollama / LM Studio · 100% free

No key, no account, no internet — your machine is the provider.

**With [Ollama](https://ollama.com):**

```bash
ollama pull qwen3:8b      # or: gpt-oss:20b, llama3.3, mistral…
ollama serve              # usually already running
```

**With [LM Studio](https://lmstudio.ai):** download a model from the app
and start the local server (Developer tab → Start Server, default port 1234).

Then in Uni: tap the **Ollama (local)** or **LM Studio (local)** preset,
**Add profile**, and **Connect** — local servers need no key, but the
connection test still discovers the models you pulled. A green **Live**
badge means replies stream from your own hardware.

> Other presets work the same way: Cerebras, Fireworks, Perplexity,
> SambaNova, NVIDIA NIM, Cohere, GitHub Models (free with a GitHub
> account), HuggingFace Router, Together, Mistral, Alibaba DashScope
> (Qwen), and Zhipu GLM. And **any OpenAI-compatible endpoint** — custom
> base URL, custom models — works through the *OpenAI-compatible* provider
> type.

---

## 💚 The 100% free path

Uni costs nothing, and you can run the *whole* stack at zero cost. Pick
any combination:

| Path | What you get | Cost |
| --- | --- | --- |
| **Groq free tier** | GPT-OSS 120B, Llama 3.3 70B at extreme speed, generous rate limits | **$0** |
| **Google AI Studio** | Gemini Flash models for personal use | **$0** |
| **OpenRouter `:free` models** | A rotating set of free models from many vendors | **$0** |
| **GitHub Models** | GPT and Llama models with your GitHub account | **$0** |
| **Mistral free tier** | Mistral Small + experiments on La Plateforme | **$0** |
| **HuggingFace Router** | Monthly free inference credits for open models | **$0** |
| **Cerebras free tier** | Fast open-model inference | **$0** |
| **NVIDIA NIM** | Free build credits at build.nvidia.com | **$0** |
| **Ollama / LM Studio** | Any open model, fully offline, on your hardware | **$0** |

In the provider form, anything with a green **FREE** badge has a no-cost
tier. Connect one, pick a model, and you have a private premium chat
product for exactly nothing.

---

## ⚙️ Settings reference

Open **Settings** from the profile button at the bottom of the sidebar
(keyboard shortcut: `Ctrl/Cmd + ,`).

| Section | What lives there |
| --- | --- |
| **Account** | Local vs server mode; the server account panel when a backend is connected. |
| **Appearance** | Light / dark / system theme, density, text size, reduced transparency. |
| **Chat** | Send-key behavior (Enter vs Ctrl/Cmd+Enter), your nickname, persona traits. |
| **Data** | Export / import your workspace, storage details, reset. |
| **Providers & models** | Everything API: presets, custom endpoints, keys, model lists, connection status. |
| **Privacy & about** | Where your data lives, what is simulated, licenses. |

**Provider card anatomy:**

- **Models (click to activate)** — chips activate a model instantly; long
  discovered lists collapse behind a `+N more models` toggle.
- **API key / Connect** — the key is stored only in this browser (in a
  separate storage slice that exports never include) and sent only to the
  endpoint shown on the card.
- **Test again** — re-runs the honest connection check (including
  OpenRouter's `/key` verification).
- **Edit** — change label, provider type, endpoint, or the model list.
- **Disconnect / Delete** — remove the key or the whole profile.

---

## 📸 Screenshots

| | |
| --- | --- |
| ![Home — new chat](docs/screenshots/desktop-light-home.png) | ![Providers settings](docs/screenshots/desktop-light-settings-providers.png) |
| *Home — the composer with tool pickers* | *Providers & models — profiles, models, connection status* |
| ![Suggested models](docs/screenshots/desktop-light-suggested-models.png) | ![Connected provider](docs/screenshots/desktop-light-connected.png) |
| *Suggested models for OpenRouter — free picks marked* | *A connected provider with auto-discovered models* |
| ![Live chat](docs/screenshots/desktop-light-live-chat.png) | ![Dark theme](docs/screenshots/desktop-dark-chat.png) |
| *Live streamed reply (green LIVE badge)* | *Dark theme* |
| ![Mobile light](docs/screenshots/mobile-light-home.png) | ![Mobile light chat](docs/screenshots/mobile-light-chat.png) |
| *Mobile — light home* | *Mobile — light conversation* |
| ![Mobile dark](docs/screenshots/mobile-dark-home.png) | |
| *Mobile — dark* | |

More captures (including tablet views and per-milestone evidence) live in
[`frontend/docs/screenshots/`](frontend/docs/screenshots).

---

## 🏗️ Architecture

Uni ships as three packages:

```
┌─────────────────────────┐        ┌──────────────────────────┐
│  frontend (React/Vite)  │        │  backend (Fastify)       │
│  browser-only by default│  API   │  accounts · runs · keys  │
│  BYOK chat → providers  │◄──────►│  PostgreSQL + Drizzle    │
└───────────┬─────────────┘  REST  └────────────┬─────────────┘
            │                                        │
            │  shared DTOs + zod schemas + SSE types │
            └──────────── packages/contracts ────────┘
```

- **Frontend** (`frontend/`) — React 18 + TypeScript + Vite. React Router,
  Zustand stores, versioned localStorage persistence. **Local mode is the
  default**: your keys stay in the browser and chat requests go straight
  from the browser to the provider.
- **Backend** (`backend/`) — optional Fastify modular monolith: Better Auth
  accounts, encrypted (AES-256-GCM) server-side credentials, durable
  streamed runs, SSRF-guarded outbound calls. PostgreSQL via Drizzle.
- **Contracts** (`packages/contracts/`) — the only coupling point between
  the two: shared DTOs and zod schemas.

**Where do my API requests go?** In local mode (the default), requests go
directly from your browser to the provider endpoint you configured —
Uni's servers are never in the path (there are none). In server mode,
the backend proxies requests with your encrypted key and an SSRF guard.

---

## 🧰 Full-stack development (backend)

The frontend alone is a complete product. The backend adds accounts,
server-encrypted credentials, and durable runs — useful for teams or
multi-device use.

```bash
# 1. Contracts first (backend links the build output)
cd packages/contracts && npm install && npm run build && cd ../..

# 2. Backend
cd backend
cp .env.example .env          # then fill in the secrets it documents
npm install
npm run db:migrate            # needs a PostgreSQL (see below)
npm run dev                   # → http://127.0.0.1:4000
```

**PostgreSQL options:**

```bash
# Option A — Docker (matches infra/docker-compose.yml)
docker compose -f infra/docker-compose.yml up -d

# Option B — any PostgreSQL you already run; point backend/.env at it:
# DATABASE_URL=postgres://user:pass@127.0.0.1:5432/uni
```

**Testing needs no database at all** — the integration suite boots an
embedded PostgreSQL per test file:

```bash
cd backend && npm test
```

The frontend picks the API up automatically in development (the Vite dev
server proxies `/api` and `/health` to port 4000), or configure
`frontend/.env` with `VITE_API_BASE_URL`.

> **Gotcha:** shell environment variables win over `backend/.env` (standard
> dotenv behavior). If a `DATABASE_URL` is already exported in your shell,
> the one in `.env` is ignored — unset it or export the value you want.

---

## 📁 Project structure

```
Uni/
├── frontend/                  # React 18 + TypeScript + Vite app
│   ├── src/features/          #   chat, settings, work, agents, plugins, library…
│   ├── src/state/             #   Zustand stores + persistence slices
│   ├── src/services/          #   live adapter, BYOK connection, storage
│   ├── src/components/ui/     #   the design system (Button, Menu, Dialog…)
│   └── tests/                 #   48 files / 339 tests (Vitest + Testing Library)
├── backend/                   # Fastify modular monolith (optional server mode)
│   ├── src/modules/           #   auth, providers, conversations, runs, memory…
│   ├── src/lib/               #   secretBox (AES-256-GCM), urlGuard (SSRF), logger
│   ├── drizzle/               #   committed migrations
│   └── tests/                 #   13 files / 105 integration tests (embedded PG)
├── packages/contracts/        # shared DTOs + zod schemas (the only coupling)
├── docs/                      # project records: roadmap, verification, handoff
├── infra/docker-compose.yml   # dev PostgreSQL
└── .github/workflows/ci.yml   # contracts + frontend + backend CI
```

---

## 🩺 Troubleshooting

**"Could not reach the endpoint from this browser"**
Your browser could not connect — check the URL (usually ends in `/v1`,
never include `/chat/completions`), your network, and whether the provider
allows direct browser (CORS) requests. OpenAI, Anthropic, OpenRouter,
Groq, Google, DeepSeek, Mistral, and the local servers all allow it.

**"401 Unauthorized — the saved API key was rejected"**
The key is wrong, expired, or from a different account. Generate a new one
at the provider's console and reconnect. (OpenRouter: Uni verifies keys
against `/key`, because OpenRouter's model list is public.)

**"404 Not found — the model or endpoint path may be wrong"**
Usually a model id typo or a base URL that already includes
`/chat/completions`. Remove the path — Uni appends it automatically — or
pick a model from the discovered list instead of typing one.

**"The provider connected but returned no content"**
The endpoint answered but streamed nothing usable. Some reasoning models
emit their answer in a field Uni's streaming parser does not read yet —
try a standard chat model (anything without "reasoning" in the name).

**Backend: "relation 'user' does not exist"**
Migrations have not run against your database: `npm run db:migrate` in
`backend/`.

**Backend starts but `/health/ready` says the database is down**
Check `DATABASE_URL` in `backend/.env` — and remember exported shell
variables override `.env` (unset a stale `DATABASE_URL` first).

**My provider is not in the preset list**
Use the **OpenAI-compatible** provider type and paste your custom base
URL. That works for any endpoint speaking the OpenAI protocol — add model
ids manually or connect a key to discover them.

**A commit shows "Vercel — Deployment rate limited — retry in 24 hours"**
That check comes from the Vercel account hosting the live demo, not from
this repository. Vercel's free tier caps deployments per day; when the
cap is hit the check reports "rate limited" and Vercel retries the
deployment automatically after the window resets. Nothing in the repo is
broken and no action is needed — the repo's own CI and the GitHub Pages
build are separate checks and stay green.

---

## ❓ FAQ

**Is Uni really free?**
Yes — MIT-licensed, no accounts required, no paywalled features. Model
usage is billed by whoever issues your API key; with a free-tier provider
(or local models) that is $0 too.

**Where are my API keys stored?**
In your browser's localStorage, in a dedicated slice that is **never**
included in exports. They are sent only to the endpoint you configured. In
optional server mode, keys are stored AES-256-GCM-encrypted and never
leave the backend unencrypted.

**Can I use multiple providers at once?**
Yes — add as many profiles as you like and switch models from the top bar.
The compare dialog even runs one prompt through two models side by side.

**Can I install Uni as an app?**
Yes — Uni is a **PWA**. On your phone: *Share → Add to Home Screen*
(iOS Safari) or the browser's *Install app* prompt (Android/desktop
Chrome/Edge). It opens full-screen with its own icon, works offline for
the app shell, and keeps behaving like the site — same data, same
browser storage, no separate account.

**What is "demo mode"?**
The state before any key is connected: replies come from a local,
clearly-labeled demo adapter that contacts no one. It exists so you can
explore everything before creating any account anywhere.

**Does Uni train on my conversations?**
Uni does nothing with your data — it is a client. Whatever the connected
provider does with requests is governed by that provider's terms; local
models keep everything on your machine.

**Something looks simulated — is that a bug?**
No — it is the honesty policy. Every not-yet-real integration is labeled
as a preview in the UI instead of pretending.

---

## ⌨️ Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Enter` (default) or `Ctrl/Cmd + Enter` | Send the message (configurable in Settings → Chat) |
| `Shift + Enter` | New line — never sends |
| `Ctrl/Cmd + K` | Search the workspace |
| `Ctrl/Cmd + ,` | Open Settings |
| `Escape` | Close the topmost surface (menu, dialog) |

## 🤝 Contributing

Pull requests are welcome — setup, commands, layout conventions, and the
PR checklist live in [CONTRIBUTING.md](CONTRIBUTING.md). The one rule:
**truthful labels everywhere** — if something is simulated, the UI says so.

---

## 📄 License & credits

- Frontend: MIT (see [`frontend/LICENSE`](frontend/LICENSE)).
- Backend and contracts: MIT.
- Reused permissively-licensed code is recorded in
  [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and
  [`docs/opensource-reuse.md`](docs/opensource-reuse.md).
- Uni is an independent project and is not affiliated with OpenAI,
  Anthropic, Google, or any other provider.

Built to prove a premium AI workspace can be free, private, and honest.
Enjoy! ✨
