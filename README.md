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
