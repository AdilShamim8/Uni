import type {
  AssistantDraft,
  ChatAdapter,
  ChatRequest,
  ChatStreamHandlers,
} from '@/domain/chatAdapter'
import type { SourceRef } from '@/domain/types'

/**
 * Deterministic mock chat adapter.
 *
 * - Response selection is seeded by a hash of the prompt — no randomness,
 *   so tests and demos are reproducible.
 * - Streaming is simulated with word-level chunks on a timer and respects
 *   AbortSignal (stop).
 * - A prompt starting with `/fail` simulates a generation error so the
 *   error/retry UI can be exercised deliberately.
 */

export interface MockAdapterOptions {
  /** Delay between streamed chunks in ms (default 26). */
  chunkDelay?: number
  /** Delay before the first token in ms (default ~350-650, seeded). */
  firstTokenDelay?: number
}

/** Fixture sources — reserved example domains, labeled as examples. */
const EXAMPLE_SOURCES: SourceRef[] = [
  {
    id: 'src-example-1',
    title: 'Example Journal — Topic Overview',
    url: 'https://example.org/journal/topic-overview',
    snippet:
      'A sample source record used to demonstrate citations. This is fixture content, not a real page.',
    example: true,
  },
  {
    id: 'src-example-2',
    title: 'Example Notes — Practical Summary',
    url: 'https://example.com/notes/practical-summary',
    snippet:
      'Second sample source for the citation preview. No real page was fetched.',
    example: true,
  },
  {
    id: 'src-example-3',
    title: 'Example Archive — Background Reading',
    url: 'https://example.net/archive/background',
    snippet:
      'Third sample source demonstrating the sources list. Links point at reserved example domains.',
    example: true,
  },
]

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pick<T>(items: T[], seed: number): T {
  return items[seed % items.length]
}

function summarizeTopic(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= 80) return cleaned
  return `${cleaned.slice(0, 80).trim()}…`
}

const CODE_RESPONSE = (topic: string) => `Here is a small, self-contained example related to **${topic}**.

\`\`\`ts
type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/** Retry an async operation with linear backoff (demo fixture). */
export async function withRetry<T>(
  operation: () => Promise<T>,
  attempts = 3,
  delayMs = 120,
): Promise<Result<T>> {
  let lastError = 'unknown error'
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return { ok: true, value: await operation() }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)))
      }
    }
  }
  return { ok: false, error: lastError }
}
\`\`\`

A few notes on the shape:

- The result type forces callers to handle both outcomes explicitly.
- Backoff grows linearly rather than exponentially to keep the demo snappy.
- The snippet is fixture content rendered with syntax highlighting and a copy button — nothing is executed.`

const TABLE_RESPONSE = (topic: string) => `A compact comparison for **${topic}**:

| Approach | Best for | Trade-off |
| --- | --- | --- |
| Keep it local | Privacy and speed | No collaboration yet |
| Share a copy | Quick feedback | Copies drift from the source |
| Sync later | Team workflows | Needs the integration milestone |

Tables scroll inside their own container, so long cells never break the page layout.

> This table is illustrative demo content, not research output.`

const LIST_RESPONSE = (topic: string) => `Here are a few directions for **${topic}**:

1. **Start with the smallest useful slice** — something you can finish in one sitting.
2. **Make the feedback loop visible** — a checklist or a short log beats a vague plan.
3. **Set a review point** — one honest look at the end beats three anxious ones during.
4. **Park the tangents** — keep a side list so curiosity is captured, not followed.
5. **Decide what "done" means** before starting; ambiguity is where momentum goes to rest.

Pick one and I can expand it into concrete steps.`

const DEFAULT_RESPONSE = (topic: string, seed: number) => `Here is a take on **${topic}**.

${pick(
  [
    'The core of it is simpler than it first looks: separate what must be true from what would merely be nice, and start with the first list.',
    'It helps to frame this as three questions: what are you optimizing for, what can change, and what is fixed for now.',
    'The useful move is usually to shrink the question until it has a concrete answer, then rebuild outward from that.',
  ],
  seed,
)}

- **What matters most:** clarity about the outcome before choosing the method.
- **A practical step:** write down the constraint that hurts most; design around it first.
- **What to ignore for now:** anything that only matters if this works twice as well, twice as fast.

This response came from the **local demo adapter** — deterministic, simulated, and never sent to a real provider.`

function buildResponse(request: ChatRequest): string {
  const prompt = request.prompt.trim()
  const lower = prompt.toLowerCase()

  if (request.tools.includes('research')) {
    return `I have opened the **Research preview** with your brief.

The preview runs a clearly labeled simulation (planning, searching, reading, synthesizing) and produces a fixture report with example sources. Your brief is prefilled there — this chat stays available for follow-up questions.`
  }
  if (request.tools.includes('images')) {
    return `I have opened the **Images preview** with your prompt.

No image generation happens in this prototype — the preview shows an original bundled sample and the options you selected, honestly labeled as simulated output.`
  }
  if (request.tools.includes('voice')) {
    return `I have opened the **Voice preview**.

It demonstrates the call states and a sample transcript without touching your microphone. Your prompt is carried over as the session topic.`
  }
  if (request.tools.includes('canvas')) {
    return `I have opened the **Canvas panel** with your text as the starting document.

Canvas in this milestone is an editable local document with a code fixture — no execution, no sync, just a honest side-by-side workspace.`
  }

  const topic = summarizeTopic(prompt)
  if (/code|function|typescript|javascript|snippet|implement|bug|refactor|script/i.test(lower)) {
    return CODE_RESPONSE(topic)
  }
  if (/table|compare|versus|vs\.?\b|trade-?off/i.test(lower)) {
    return TABLE_RESPONSE(topic)
  }
  if (/list|ideas|brainstorm|plan|steps|outline|checklist/i.test(lower)) {
    return LIST_RESPONSE(topic)
  }
  return DEFAULT_RESPONSE(topic, hashString(prompt))
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) return resolve()
    const timer = setTimeout(finish, ms)
    function finish() {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    signal.addEventListener('abort', finish, { once: true })
  })
}

export function createMockAdapter(options: MockAdapterOptions = {}): ChatAdapter {
  const chunkDelay = options.chunkDelay ?? 26
  const firstTokenDelay = options.firstTokenDelay

  return {
    id: 'universe-mock-adapter',
    label: 'Universe local demo adapter',

    async stream(
      request: ChatRequest,
      handlers: ChatStreamHandlers,
      signal: AbortSignal,
    ): Promise<void> {
      const seed = hashString(request.prompt)
      const prompt = request.prompt.trim()

      // Documented error trigger for exercising retry states.
      if (prompt.toLowerCase().startsWith('/fail')) {
        await sleep(420, signal)
        handlers.onError({
          code: 'mock_error',
          message: 'Simulated generation failure (triggered by the /fail demo command).',
        })
        return
      }

      const usedSearch = request.tools.includes('search')
      const draft: AssistantDraft = usedSearch
        ? {
            statusPrefix: 'Searched the web (simulated)',
            sources: EXAMPLE_SOURCES,
          }
        : {}

      const lead = firstTokenDelay ?? 320 + (seed % 14) * 22
      await sleep(lead, signal)
      if (signal.aborted) {
        handlers.onDone('stopped')
        return
      }

      handlers.onStart(draft)

      const response = buildResponse(request)
      const chunks = response.match(/\S+\s*|\s+/g) ?? [response]
      let sent = 0
      for (const chunk of chunks) {
        if (signal.aborted) break
        await sleep(chunkDelay, signal)
        if (signal.aborted) break
        handlers.onDelta(chunk)
        sent += chunk.length
      }

      if (signal.aborted) {
        handlers.onDone(sent > 0 ? 'stopped' : 'stopped')
        return
      }
      handlers.onDone('complete')
    },
  }
}
