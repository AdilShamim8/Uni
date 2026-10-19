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
localStorage slices, and Work execution is a clearly-labeled local
simulation. If you connect your own provider key in Settings, chat requests
(and only chat requests) go directly from your browser to that endpoint —
the key is stored privately on your device and never appears in exports.
