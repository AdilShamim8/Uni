import type { Conversation, MessageNode, Preferences, ProviderProfile } from '@/domain/types'
import { makeId } from '@/domain/ids'

/**
 * Deterministic demo data. Everything here is original Universe content,
 * clearly labeled as demo/fixture material in the UI.
 */

export const DEFAULT_PREFERENCES: Preferences = {
  density: 'comfortable',
  textSize: 'm',
  sendKey: 'enter',
  nickname: '',
  traits: '',
  assistantPresetId: null,
  sidebarCollapsed: false,
}

interface SeedTurn {
  role: 'user' | 'assistant'
  content: string
}

function buildConversation(options: {
  title: string
  createdAt: number
  updatedAt: number
  pinned?: boolean
  archived?: boolean
  turns: SeedTurn[]
}): Conversation {
  const nodes: Record<string, MessageNode> = {}
  const span = Math.max(1, options.updatedAt - options.createdAt)
  const step = Math.floor(span / Math.max(1, options.turns.length))
  let parentId: string | null = null
  let lastId: string | null = null
  options.turns.forEach((turn, index) => {
    const node: MessageNode = {
      id: makeId(turn.role === 'user' ? 'u' : 'a'),
      parentId,
      role: turn.role,
      content: turn.content,
      createdAt: options.createdAt + index * step,
      status: 'complete',
      feedback: null,
    }
    nodes[node.id] = node
    parentId = node.id
    lastId = node.id
  })
  return {
    id: makeId('c'),
    title: options.title,
    createdAt: options.createdAt,
    updatedAt: options.updatedAt,
    pinned: options.pinned ?? false,
    archived: options.archived ?? false,
    temporary: false,
    nodes,
    activeLeafId: lastId,
  }
}

export function buildSeedConversations(now = Date.now()): Conversation[] {
  const minute = 60_000
  const hour = 3_600_000
  const day = 86_400_000

  const welcome = buildConversation({
    title: 'Welcome to Universe',
    createdAt: now - 30 * minute,
    updatedAt: now - 24 * minute,
    pinned: true,
    turns: [
      {
        role: 'user',
        content: 'What is Universe?',
      },
      {
        role: 'assistant',
        content:
          'Universe is an independent, open-source workspace project that aims to bring chat, research, creative tools, coding, work, and email into one place — without subscription gates.\n\nThis build is the **first milestone**: a chat frontend running entirely in your browser. A few honest notes about what you are looking at:\n\n- Responses come from a **local demo adapter** — nothing is sent to any provider.\n- Conversations and settings persist in `localStorage` on this device only.\n- Tools such as Research, Images, Voice, and Canvas open **labeled previews**, not real integrations.\n- There is no account, no backend, and no credentials involved.',
      },
      { role: 'user', content: 'What should I try first?' },
      {
        role: 'assistant',
        content:
          'A quick tour, in rough order:\n\n1. **Send a message** below and stop or retry the response mid-stream.\n2. **Edit one of your earlier messages** — Universe keeps the original branch so nothing is lost, and you can switch between variants with the arrows on a message.\n3. Open **Settings** (bottom of the sidebar) and try the theme, density, and text-size controls.\n4. Look at **Providers** in settings: profiles and models are local configuration concepts, with an explicitly simulated connection test.\n5. Toggle **Temporary chat** in the top bar — that conversation stays in memory and disappears on reload.\n\nEverything you see is labeled honestly: working local UI, simulated workflows, or a clear note about what is deferred.',
      },
    ],
  })

  const markdownShowcase = buildConversation({
    title: 'Formatting showcase',
    createdAt: now - 3 * hour,
    updatedAt: now - 2 * hour,
    turns: [
      { role: 'user', content: 'Show me what message formatting can do.' },
      {
        role: 'assistant',
        content:
          'Here is a tour of what the message renderer supports.\n\n## Structure\n\nText can be **bold**, *italic*, or `inline code`. Links like [this example link](https://example.org/what-universe-renders) open safely in a new tab — the URL points at a reserved example domain on purpose.\n\n## Lists\n\n- Fenced code blocks with syntax highlighting and a copy button\n- Tables that scroll horizontally instead of breaking the layout\n- Quotes and horizontal rules\n\n## Code\n\n```ts\nexport function formatDuration(ms: number): string {\n  if (ms < 1000) return `${ms}ms`\n  const seconds = Math.round(ms / 1000)\n  if (seconds < 60) return `${seconds}s`\n  const minutes = Math.floor(seconds / 60)\n  return `${minutes}m ${seconds % 60}s`\n}\n```\n\n## Tables\n\n| Demo surface | Purpose | Status |\n| --- | --- | --- |\n| Chat | Simulated streaming, branching, export | Working locally |\n| Research | Brief in, fixture report out | Labeled preview |\n| Providers | Local profiles, simulated test | Configuration UI |\n\n> Formatting is rendered from Markdown; raw HTML in messages is disabled for safety.',
      },
    ],
  })

  const tripPlan = buildConversation({
    title: 'Relaxed weekend ideas',
    createdAt: now - day - 2 * hour,
    updatedAt: now - day - 1 * hour,
    turns: [
      {
        role: 'user',
        content: 'Help me plan a relaxed weekend with a mix of outdoors and reading time.',
      },
      {
        role: 'assistant',
        content:
          'Here is a gentle frame you can adapt:\n\n**Saturday**\n- Morning: a slow walk somewhere green — no podcasts, just the walk\n- Afternoon: two reading blocks of 25 minutes with a stretch between them\n- Evening: cook something simple and write three lines about the week\n\n**Sunday**\n- Late start, then a hobby hour that has nothing to do with productivity\n- A short “closing” walk to end the weekend deliberately\n\nWant me to reshape it around a specific city, weather, or a book you are reading?',
      },
      { role: 'user', content: 'Make it rainy-day friendly.' },
      {
        role: 'assistant',
        content:
          'Rainy version:\n\n1. Swap the walks for a **window-side tea ritual** — same slow pace, drier socks.\n2. Move reading to the best-lit corner of your home; two blocks become three if the rain is good.\n3. Replace cooking with a slow-simmer soup or a bake that fills the afternoon.\n4. End Sunday with a film or album you already love — low-effort comfort counts as rest.\n\nThe structure stays: one slow anchor in the morning, deliberate rest in the evening.',
      },
    ],
  })

  const learningNotes = buildConversation({
    title: 'Notes on learning habits',
    createdAt: now - 8 * day,
    updatedAt: now - 8 * day + hour,
    archived: true,
    turns: [
      { role: 'user', content: 'Summarize ideas for building a daily learning habit.' },
      {
        role: 'assistant',
        content:
          'Five ideas that hold up well:\n\n1. **Shrink the first step** — one page, one exercise, one minute of setup.\n2. **Attach it to an existing routine** — coffee, commute, or lunch break as the anchor.\n3. **Track streaks lightly** — a checkmark, not a scoreboard.\n4. **Keep a “parking lot”** for tangents so curiosity does not derail the session.\n5. **Review weekly, adjust monthly** — habits drift; the review is the habit that protects the others.',
      },
    ],
  })

  return [welcome, markdownShowcase, tripPlan, learningNotes]
}

export function buildSeedProviders(): ProviderProfile[] {
  return [
    {
      id: 'provider-demo-balanced',
      label: 'Universe Demo — Balanced',
      kind: 'openai-compatible',
      endpointUrl: 'https://your-endpoint.example/v1',
      demo: true,
      models: [
        {
          id: 'demo-mini',
          label: 'Demo Mini',
          demo: true,
          capabilities: ['chat'],
        },
        {
          id: 'demo-standard',
          label: 'Demo Standard',
          demo: true,
          capabilities: ['chat', 'search'],
        },
        {
          id: 'demo-pro',
          label: 'Demo Pro',
          demo: true,
          capabilities: [
            'chat',
            'search',
            'research',
            'images',
            'voice',
            'canvas',
            'data-analysis',
            'code',
          ],
        },
      ],
    },
    {
      id: 'provider-demo-anthropic-style',
      label: 'Demo — Another-style profile',
      kind: 'anthropic',
      endpointUrl: 'https://your-endpoint.example/another',
      demo: true,
      models: [
        {
          id: 'demo-chat-s',
          label: 'Demo Chat S',
          demo: true,
          capabilities: ['chat', 'search'],
        },
      ],
    },
    {
      id: 'provider-demo-local',
      label: 'Demo — Local endpoint',
      kind: 'local',
      endpointUrl: 'http://localhost:8080/v1',
      demo: true,
      models: [
        {
          id: 'demo-local',
          label: 'Demo Local',
          demo: true,
          capabilities: ['chat', 'code'],
        },
      ],
    },
  ]
}
