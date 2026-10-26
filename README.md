## Uni ✨

Uni (formerly Universe) is an independent, open-source, provider-independent
AI workspace. This repository hosts the **frontend** built with React,
TypeScript, and Vite, organized into five destinations:

- **Chat** — conversations with models. Bring your own API key to chat
  live with any supported OpenAI-compatible or Anthropic endpoint; without
  one, a clearly-labeled local demo adapter responds.
- **Work** — outcomes as a conversation. Describe a goal and the task
  thread opens immediately: watch the run, answer inline questions, review
  the output, then refine it with follow-up messages (a real revision for
  AI drafts; a guided rerun for the local demo).
- **Agents** — persistent AI employees. Selecting one opens its actual
  conversation directly, with memory notes, assigned work, plugin access,
  and routines in a compact inspector.
- **Plugins** — local tools. Enable built-ins (Documents, Data analysis,
  Library context), grant them per thread, and see an honest receipt for
  every action; external entries stay clearly unconnected until a real
  integration exists.
- **Library** — one shared local collection of artifacts and lightweight
  projects.

### Try the frontend

```bash
cd frontend
npm install
npm run dev
```

See [`frontend/README.md`](frontend/README.md) for setup, architecture, and
commands; [`frontend/docs/`](frontend/docs) for the milestone-3 audit,
architecture map, design tokens, verification results, and the
feature-status matrix.

### How data and privacy work

Everything runs locally in your browser: conversations, tasks, agent
profiles, memory notes, and library artifacts persist in versioned
localStorage slices. Work has two honest modes: without a provider key it
is a clearly-labeled local simulation, and with your own key connected in
Settings, Work drafting and revisions make real, streamed requests to that
endpoint. Chat and Work BYOK requests go directly from your browser to the
configured endpoint — the key is stored privately on your device and never
appears in exports. A server-backed mode (accounts, encrypted credentials,
durable runs) is under construction on the backend roadmap; see
[`docs/backend-roadmap.md`](docs/backend-roadmap.md) for actual status.
