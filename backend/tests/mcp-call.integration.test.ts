import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { eq } from 'drizzle-orm'
import { agentEvents } from '../src/db/schema.js'
import { signUpUser, startTestApp, type TestApp } from './harness.js'
import type { AgentDatabase } from '../src/modules/agent/agentSession.service.js'

/**
 * T024 — MCP tool execution through the agent engine:
 *
 * - The model calls mcp_call on a namespaced tool.
 * - The permission gate ALWAYS asks (run_mcp_tool), even though the
 *   remote declares a readOnly hint — an untrusted hint never relaxes
 *   the gate.
 * - Approval executes the remote call; the bounded result returns to
 *   the model; the run completes.
 */

function sse(response: import('node:http').ServerResponse) {
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  return (payload: unknown) => response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

// Mutable closure the scripted provider reads at request time.
let round1Tool = '__TOOL__'

describe('mcp_call through the agent engine (T024)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let db: AgentDatabase
  let fixture: { server: Server; url: string; toolCalls: Array<{ name: string; args: unknown }> }
  let fake: { server: Server; url: string }

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice T024' })
    db = (testApp.app as unknown as { database: { db: AgentDatabase } }).database.db

    // The MCP fixture: one tool with a readOnly hint (which must NOT
    // bypass the gate) that records its calls.
    const toolCalls: Array<{ name: string; args: unknown }> = []
    const mcpServer = createServer(async (request, response) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      })
      const mcp = new McpServer(
        { name: 'notes-fixture', version: '1.0.0' },
        { capabilities: { tools: {} } },
      )
      mcp.registerTool(
        'search_notes',
        {
          description: 'Search notes',
          inputSchema: { query: z.string() },
          annotations: { readOnlyHint: true },
        },
        async ({ query }) => {
          toolCalls.push({ name: 'search_notes', args: { query } })
          return { content: [{ type: 'text', text: `found: ${String(query)}` }] }
        },
      )
      await mcp.connect(transport)
      await transport.handleRequest(request, response)
    })
    fixture = {
      server: mcpServer,
      url: '',
      toolCalls,
    }
    fixture.url = await new Promise<string>((resolve) => {
      mcpServer.listen(0, '127.0.0.1', () => {
        const address = mcpServer.address()
        if (address && typeof address === 'object') resolve(`http://127.0.0.1:${address.port}/mcp`)
      })
    })

    // The scripted provider: round 1 calls mcp_call; round 2 finishes.
    let round = 0
    const providerServer = createServer((request, response) => {
      const send = sse(response)
      round += 1
      if (round === 1) {
        send({
          id: 'c1',
          object: 'chat.completion.chunk',
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call-1',
                    type: 'function',
                    function: {
                      name: 'mcp_call',
                      arguments: JSON.stringify({
                        tool: round1Tool,
                        args: { query: 'pricing' },
                      }),
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        })
        send({ id: 'c1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })
      } else {
        send({
          id: 'c1',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: 'The MCP tool said what it said.' }, finish_reason: null }],
        })
        send({ id: 'c1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
      }
      response.write('data: [DONE]\n\n')
      response.end()
    })
    fake = { server: providerServer, url: '' }
    fake.url = await new Promise<string>((resolve) => {
      providerServer.listen(0, '127.0.0.1', () => {
        const address = providerServer.address()
        if (address && typeof address === 'object') resolve(`http://127.0.0.1:${address.port}`)
      })
    })
  }, 180_000)

  afterAll(async () => {
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()))
    await new Promise<void>((resolve) => fake.server.close(() => resolve()))
    await testApp?.stop()
  })

  it('asks permission, then executes the namespaced tool and completes', async () => {
    // Provider + credential + session.
    const provider = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie: alice.cookie },
      payload: { label: 'T024 fake', kind: 'openai-compatible', endpointUrl: fake.url, modelId: 'm' },
    })
    const providerId = (provider.json() as { id: string }).id
    await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${providerId}/credential`,
      headers: { cookie: alice.cookie },
      payload: { apiKey: 'sk-t024' },
    })

    // Configure the MCP server and find its slug.
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/mcp/servers',
      headers: { cookie: alice.cookie },
      payload: { name: 'Notes', url: fixture.url },
    })
    const serverDto = created.json() as { id: string }
    const tools = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/mcp/servers/${serverDto.id}/tools`,
      headers: { cookie: alice.cookie },
    })
    const namespaced = ((tools.json() as { items: Array<{ namespacedName: string }> }).items.find(
      (tool) => tool.namespacedName.endsWith('__search_notes'),
    )!).namespacedName

    // Patch the scripted provider round 1 to use the real namespaced name.
    // (The fixture builds it dynamically; simplest is to create the session
    // AFTER learning the name — the provider reads it from closure state.)
    round1Tool = namespaced

    const session = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/agent/sessions',
      headers: { cookie: alice.cookie },
      payload: { name: 'T024 session', providerId, modelId: 'm', tools: ['mcp_call'] },
    })
    const sessionId = (session.json() as { id: string }).id

    const run = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/agent/sessions/${sessionId}/runs`,
      headers: { cookie: alice.cookie },
      payload: { text: 'Search my notes for pricing', idempotencyKey: 't024-1' },
    })
    expect(run.statusCode).toBe(201)
    const agentRunId = (run.json() as { runId: string }).runId

    // The gate must ASK (run_mcp_tool) — the readOnly hint on the remote
    // tool must NOT bypass it.
    let requestId: string | null = null
    for (let i = 0; i < 100 && !requestId; i++) {
      const events = await db.select().from(agentEvents).where(eq(agentEvents.sessionId, sessionId))
      const ask = events.find((event) => event.type === 'permission_requested')
      if (ask) {
        const payload = ask.payload as {
          permissionRequest?: { requestId: string; type: string; mcpTool?: string }
        }
        expect(payload.permissionRequest!.type).toBe('run_mcp_tool')
        expect(payload.permissionRequest!.mcpTool).toBe(namespaced)
        requestId = payload.permissionRequest!.requestId
      } else {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
    expect(requestId).toBeTruthy()

    // Approve → the remote tool executes with the bounded result.
    const approved = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/agent/runs/${agentRunId}/permissions/${requestId}`,
      headers: { cookie: alice.cookie },
      payload: { decision: { requestId, decision: 'approve', scope: 'once' } },
    })
    expect(approved.statusCode).toBe(202)

    // Wait for the run to finish; the fixture recorded the real call.
    for (let i = 0; i < 100; i++) {
      if (fixture.toolCalls.length > 0) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(fixture.toolCalls).toEqual([{ name: 'search_notes', args: { query: 'pricing' } }])
  }, 120_000)
})

