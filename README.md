<div align="center">

# ✨ Uni

**A free, open-source AI workspace — bring your own key, keep your own data.**

Chat with GPT, Claude, Gemini, Grok, DeepSeek, Llama, and hundreds more —
through one honest interface that costs **$0** and runs from your browser.

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

## 📑 Table of contents

1. [What is Uni?](#-what-is-uni)
2. [Quick start (3 commands)](#-quick-start-3-commands)
3. [Connect your first provider (step by step)](#-connect-your-first-provider-step-by-step)
   - [OpenAI (GPT)](#1-openai--gpt) · [Anthropic (Claude)](#2-anthropic--claude) · [OpenRouter (hundreds of models)](#3-openrouter--hundreds-of-models) · [Google (Gemini)](#4-google--gemini-free-tier) · [Groq (free tier)](#5-groq--free-tier) · [DeepSeek](#6-deepseek) · [Local models (Ollama / LM Studio)](#7-local-models--ollama--lm-studio--100-free)
4. [The 100% free path](#-the-100-free-path)
5. [Settings reference](#%EF%B8%8F-settings-reference)
6. [Screenshots](#-screenshots)
7. [Architecture](#-architecture)
8. [Full-stack development (backend)](#-full-stack-development-backend)
9. [Project structure](#-project-structure)
10. [Troubleshooting](#-troubleshooting)
11. [FAQ](#-faq)
12. [License & credits](#-license--credits)

---

## 🚀 Quick start (3 commands)

You need [Node.js 20+](https://nodejs.org) and nothing else — no database,
no Docker, no account.

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
| ![Mobile](docs/screenshots/mobile-light-home.png) | |
| *Mobile — the responsive layout* | |

More captures (including tablet views and per-milestone evidence) live in
[`frontend/docs/screenshots/`](frontend/docs/screenshots).
