## Universe ✨

Universe is an independent, open-source, provider-independent AI workspace.
This repository hosts the **frontend** built with React, TypeScript, and
Vite, organized into four destinations:

- **Chat** — conversations with models. Bring your own API key to chat
  live with any supported OpenAI-compatible or Anthropic endpoint; without
  one, a clearly-labeled local demo adapter responds.
- **Work** — outcomes. Describe a task, run it as a local demo, answer the
  run's questions, review and edit the output, then download it or save it
  to your Library.
- **Agents** — reusable instruction profiles, including the persistent
  Universe Assistant with memory notes and schedule drafts.
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
