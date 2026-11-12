import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { eq } from 'drizzle-orm'
import { agentEvents, agentRuns } from '../src/db/schema.js'
import { signUpUser, startTestApp, type TestApp } from './harness.js'
import type { AgentDatabase } from '../src/modules/agent/agentSession.service.js'

/**
 * P10 / T037 — the knowledge_search agent tool, end-to-end: a run whose
 * model calls the tool over the workspace's indexed documents gets the
 * REAL excerpt back (from the files module's lexical index), and the
 * run completes with the tool outcome persisted as an event.
 */

const API_KEY = 'sk-knowledge-test-key-abcdef123456'

function sseToolCall(response: import('node:http').ServerResponse, name: string, args: unknown) {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const send = (payload: unknown) => response.write(`data: ${JSON.stringify(payload)}\n\n`)
  send({
    id: 'chatcmpl-knowledge',
    object: 'chat.completion.chunk',
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: 'call-knowledge-1',
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  })
  send({
    id: 'chatcmpl-knowledge',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
  })
  response.write('data: [DONE]\n\n')
  response.end()
}

function sseText(response: import('node:http').ServerResponse, text: string) {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const send = (payload: unknown) => response.write(`data: ${JSON.stringify(payload)}\n\n`)
  send({
    id: 'chatcmpl-knowledge',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  })
  send({
    id: 'chatcmpl-knowledge',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  })
  response.write('data: [DONE]\n\n')
  response.end()
}

describe('knowledge_search agent tool (T037)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let db: AgentDatabase
  let fake: { server: Server; url: string }

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Knowledge' })
    db = (testApp.app as unknown as { database: { db: AgentDatabase } }).database.db

    let round = 0
    const server = createServer((request, response) => {
      if (!(request.url ?? '').includes('/chat/completions')) {
        response.writeHead(404, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'not found' }))
        return
      }
      if (request.headers.authorization !== `Bearer ${API_KEY}`) {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'invalid key' }))
        return
      }
      round += 1
      if (round === 1) {
        sseToolCall(response, 'knowledge_search', { query: 'routines launcher', limit: 5 })
      } else {
        sseText(response, 'Based on the notes: the routines launcher shipped smoothly.')
      }
    })
    fake = { server, url: '' }
    fake.url = await new Promise<string>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address && typeof address === 'object') resolve(`http://127.0.0.1:${address.port}`)
      })
    })
    await testApp.app.listen({ port: 0, host: '127.0.0.1' })
  }, 180_000)

  afterAll(async () => {
    await new Promise<void>((resolve) => fake.server.close(() => resolve()))
    await testApp?.app.close()
    await testApp?.stop()
  })

  it('returns the real excerpt to the model and completes the run', async () => {
    // 1. Index a document through the real files API.
    const ingested = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/files',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: {
        title: 'Retro notes',
        fileName: 'retro.txt',
        content: 'The retrospective agreed the routines launcher shipped smoothly.',
      },
    })
    expect(ingested.statusCode).toBe(201)

    // 2. Provider + credential.
    const provider = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie: alice.cookie },
      payload: {
        label: 'Knowledge fake',
        kind: 'openai-compatible',
        endpointUrl: fake.url,
        modelId: 'model-knowledge',
      },
    })
    const providerId = (provider.json() as { id: string }).id
    await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${providerId}/credential`,
      headers: { cookie: alice.cookie },
      payload: { apiKey: API_KEY },
    })

    // 3. A session whose roster includes knowledge_search.
    const session = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/agent/sessions',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: {
        name: 'Research with knowledge',
        description: '',
        mode: 'default',
        tools: ['knowledge_search'],
        providerId,
        modelId: 'model-knowledge',
      },
    })
    expect(session.statusCode).toBe(201)
    const sessionId = (session.json() as { id: string }).id

    // 4. Start the run; the model searches, then answers.
    const started = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/agent/sessions/${sessionId}/runs`,
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: { text: 'How did the routines launcher go?' },
    })
    expect(started.statusCode).toBe(201)
    const runId = (started.json() as { runId: string }).runId

    // 5. The tool result event carries the REAL excerpt from the index.
    let toolResult: { toolName?: string; toolOutput?: string; toolResultStatus?: string } | null =
      null
    for (let i = 0; i < 150 && !toolResult; i++) {
      const events = await db
        .select()
        .from(agentEvents)
        .where(eq(agentEvents.sessionId, sessionId))
      toolResult =
        events
          .map((event) => {
            if (event.type !== 'tool_call_result') return null
            return event.payload as {
              toolName?: string
              toolOutput?: string
              toolResultStatus?: string
            }
          })
          .find((payload) => payload?.toolName === 'knowledge_search') ?? null
      if (!toolResult) await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(toolResult).not.toBeNull()
    expect(toolResult!.toolResultStatus).toBe('ok')
    expect(toolResult!.toolOutput).toContain('Retro notes')
    expect(toolResult!.toolOutput).toContain('routines launcher shipped smoothly')

    // 6. The run completed with the final answer.
    let runStatus = ''
    for (let i = 0; i < 150 && runStatus !== 'complete'; i++) {
      const rows = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1)
      runStatus = rows[0]?.status ?? ''
      if (runStatus !== 'complete') await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(runStatus).toBe('complete')
  }, 30_000)
})
