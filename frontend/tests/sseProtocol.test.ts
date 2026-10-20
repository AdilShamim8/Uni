import { describe, expect, it, vi } from 'vitest'
import type { ChatStreamHandlers } from '@/domain/chatAdapter'
import type { ProviderProfile } from '@/domain/types'
import { createLiveAdapter } from '@/services/live/liveChatAdapter'

/**
 * Milestone 07 regression suite (F13): SSE protocol hardening. All cases
 * run against mocked responses — no paid keys, no network.
 *
 * - events split across chunk boundaries reassemble
 * - CRLF framing and multiline `data:` fields parse correctly
 * - a trailing event WITHOUT a final blank line is still delivered
 * - provider error frames are terminal: the turn errors, never
 *   completes, even after partial content
 */

function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, { status, headers: { 'Content-Type': 'text/event-stream' } })
}

function makeHandlers(): ChatStreamHandlers & {
  deltas: string[]
  done: string[]
  errors: string[]
} {
  const deltas: string[] = []
  const done: string[] = []
  const errors: string[] = []
  return {
    onStart: () => undefined,
    onDelta: (text) => deltas.push(text),
    onDone: (reason) => done.push(reason),
    onError: (error) => errors.push(error.message),
    deltas,
    done,
    errors,
  }
}

const profile: ProviderProfile = {
  id: 'provider-test',
  label: 'Test Provider',
  kind: 'openai-compatible',
  endpointUrl: 'https://api.test.example/v1',
  demo: false,
  models: [],
}

const anthropicProfile: ProviderProfile = {
  ...profile,
  id: 'provider-anthropic',
  kind: 'anthropic',
  endpointUrl: 'https://api.anthropic.com',
}

const REQUEST = {
  prompt: 'hi',
  history: [],
  tools: [],
  attachments: [],
  nickname: '',
  traits: '',
}

describe('SSE protocol hardening (F13)', () => {
  it('reassembles an event split across chunk boundaries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel',
        'lo"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const handlers = makeHandlers()
    await createLiveAdapter(profile, 'sk-key', 'm').stream(REQUEST, handlers, new AbortController().signal)
    expect(handlers.deltas).toEqual(['Hello'])
    expect(handlers.done).toEqual(['complete'])
    vi.unstubAllGlobals()
  })

  it('parses CRLF framing and joins multiline data fields', async () => {
    // Multiline JSON split across two data lines must arrive as ONE
    // payload joined by a newline.
    const payload = ['{', '  "choices": [{"delta": {"content": "CRLF ok"}}]', '}'].join('\n')
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([`data: ${payload.split('\n')[0]}\r\ndata: ${payload.split('\n').slice(1).join('\r\ndata: ')}\r\n\r\ndata: [DONE]\r\n\r\n`]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const handlers = makeHandlers()
    await createLiveAdapter(profile, 'sk-key', 'm').stream(REQUEST, handlers, new AbortController().signal)
    expect(handlers.deltas).toEqual(['CRLF ok'])
    expect(handlers.done).toEqual(['complete'])
    vi.unstubAllGlobals()
  })

  it('delivers a trailing event without a final blank line', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse(['data: {"choices":[{"delta":{"content":"first"}}]}\n\ndata: {"choices":[{"delta":{"content":"last"}}]}']),
    )
    vi.stubGlobal('fetch', fetchMock)
    const handlers = makeHandlers()
    await createLiveAdapter(profile, 'sk-key', 'm').stream(REQUEST, handlers, new AbortController().signal)
    expect(handlers.deltas).toEqual(['first', 'last'])
    expect(handlers.done).toEqual(['complete'])
    vi.unstubAllGlobals()
  })

  it('an OpenAI error payload is terminal — never completes after content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
        'data: {"error":{"message":"rate limited"}}\n\n',
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const handlers = makeHandlers()
    await createLiveAdapter(profile, 'sk-key', 'm').stream(REQUEST, handlers, new AbortController().signal)
    expect(handlers.deltas).toEqual(['partial'])
    expect(handlers.errors).toEqual(['rate limited'])
    expect(handlers.done).toEqual([])
    vi.unstubAllGlobals()
  })

  it('an Anthropic error event frame is terminal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"part"}}\n\n',
        'event: error\ndata: {"type":"error","error":{"message":"overloaded"}}\n\n',
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const handlers = makeHandlers()
    await createLiveAdapter(anthropicProfile, 'key', 'claude').stream(REQUEST, handlers, new AbortController().signal)
    expect(handlers.deltas).toEqual(['part'])
    expect(handlers.errors).toEqual(['overloaded'])
    expect(handlers.done).toEqual([])
    vi.unstubAllGlobals()
  })

  it('skips comment keep-alive lines without breaking the stream', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        ': keep-alive\n\n',
        'data: {"choices":[{"delta":{"content":"after comments"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const handlers = makeHandlers()
    await createLiveAdapter(profile, 'sk-key', 'm').stream(REQUEST, handlers, new AbortController().signal)
    expect(handlers.deltas).toEqual(['after comments'])
    expect(handlers.done).toEqual(['complete'])
    vi.unstubAllGlobals()
  })
})
