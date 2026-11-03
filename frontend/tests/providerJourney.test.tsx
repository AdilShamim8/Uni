import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, sessionAwareFetch, setupAppTest } from './helpers'
import { useAppStore } from '@/state/store'

/**
 * N015 — the integrated provider journey. One continuous flow takes a
 * brand-new user from the empty chat state to a live reply: empty-state
 * CTA → preset → profile saved → connect with a key (real connection
 * code over a mocked endpoint) → discovered models → "Chat with …" →
 * dialog closed, composer focused, exact model active → send → reply.
 */

setupAppTest()

const CATALOG = {
  data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'gpt-oss-120b' }],
}

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

const COMPLETION_CHUNKS = [
  `data: ${JSON.stringify({
    id: 'chatcmpl-journey',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: { content: 'Live ' }, finish_reason: null }],
  })}\n\n`,
  `data: ${JSON.stringify({
    id: 'chatcmpl-journey',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: { content: 'reply over your key.' }, finish_reason: 'stop' }],
  })}\n\n`,
  'data: [DONE]\n\n',
]

describe('integrated provider journey (N015)', () => {
  beforeEach(() => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      // The endpoint's two routes: the public catalog for discovery,
      // and an OpenAI-style SSE completion for live chat — the journey
      // exercises the REAL live adapter, not the demo mock.
      if (String(url).endsWith('/models')) {
        return new Response(JSON.stringify(CATALOG), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      expect(init?.method).toBe('POST')
      return sseResponse(COMPLETION_CHUNKS)
    })
    vi.stubGlobal('fetch', sessionAwareFetch(fetchMock))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('goes from empty chat to a live reply in one continuous flow', async () => {
    const user = userEvent.setup()
    renderApp('/chat')

    // 1. The empty state's CTA deep-links into Providers & models.
    await user.click(screen.getByRole('button', { name: /Connect a supported provider/i }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Settings' }))
    expect(dialog.getByRole('heading', { name: 'Providers and models' })).toBeInTheDocument()

    // 2. One-tap preset fills the form; save the profile.
    await user.click(dialog.getByRole('button', { name: 'Add provider profile' }))
    await user.click(dialog.getByRole('button', { name: /^Groq/ }))
    await user.click(dialog.getByRole('button', { name: 'Add profile' }))

    // 3. Connect with a key — the real connection code runs against the
    //    mocked catalog; discovery adopts the endpoint's models. The
    //    newly saved profile is the LAST provider article (after the
    //    demo seeds).
    const cards = await screen.findAllByRole('article')
    const providerCard = within(cards[cards.length - 1]!)
    expect(providerCard.getByText('Groq')).toBeInTheDocument()
    await user.type(providerCard.getByLabelText('API key'), 'gsk-journey-key')
    await user.click(providerCard.getByRole('button', { name: 'Connect' }))
    expect(await providerCard.findByText(/Connected in \d+ms — 2 models available\./)).toBeInTheDocument()
    // The discovered models replaced the profile's empty list
    // (deterministic alphabetical order: gpt-oss-120b first).
    expect(providerCard.getByRole('button', { name: /^gpt-oss-120b$/ })).toBeInTheDocument()
    expect(providerCard.getByRole('button', { name: /^llama-3.3-70b-versatile$/ })).toBeInTheDocument()

    // 4. The journey's last step: "Chat with …" — the exact first
    //    discovered model is activated, the dialog closes, and the
    //    composer receives focus (no hunting for the model picker).
    const startChatting = await providerCard.findByRole('button', {
      name: /Chat with gpt-oss-120b/i,
    })
    await user.click(startChatting)

    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
    const state = useAppStore.getState()
    expect(state.activeModelId).toBe('gpt-oss-120b')
    const composer = await screen.findByPlaceholderText('Message Uni…')
    expect(document.activeElement).toBe(composer)

    // 5. Send a message — the REAL live adapter streams the endpoint's
    //    SSE reply (the provider is connected, so chat goes live), and
    //    the journey completes. (The message text also titles the
    //    conversation, so multiple matches are honest.)
    await user.type(composer, 'Hello from the integrated journey')
    await user.keyboard('{Enter}')
    expect(
      (await screen.findAllByText(/Hello from the integrated journey/)).length,
    ).toBeGreaterThan(0)
    expect(await screen.findByText(/Live reply over your key\./)).toBeInTheDocument()
  })

  it('keeps the CTA honest when no provider is connected yet', async () => {
    renderApp('/chat')
    // The empty state still offers the journey's entry point.
    expect(
      screen.getByRole('button', { name: /Connect a supported provider/i }),
    ).toBeInTheDocument()
  })
})
