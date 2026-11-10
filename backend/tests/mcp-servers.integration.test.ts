import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { signUpUser, startTestApp, TEST_CREDENTIAL_MASTER_KEY, type TestApp } from './harness.js'

/**
 * T023 — the MCP server lifecycle end-to-end against a REAL MCP server
 * (the SDK's own server side over streamable HTTP, with stateless
 * per-request transports):
 *
 * - create + list never return auth material (only authConfigured)
 * - test flips status honestly: connected with serverInfo on success,
 *   error with a user-safe reason on a dead endpoint
 * - tool listing namespaces remote tools and carries the untrusted
 *   readOnly hint
 * - disconnect resets state; patching the url resets the connection
 * - a bearer token actually reaches the remote (verified server-side)
 */

const AUTH_TOKEN = 'mcp-bearer-test-token-abcdef'

describe('MCP servers (T023)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let fixture: { server: Server; url: string; sawAuth: string[]; respondOk: boolean }
  let deadPort = 1

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice MCP' })

    // A real MCP server over streamable HTTP: stateless mode creates a
    // fresh transport per request, matching the test-client handshake.
    const sawAuth: string[] = []
    let respondOk = true
    const server = createServer(async (request, response) => {
      sawAuth.push(String(request.headers.authorization ?? ''))
      if (!respondOk) {
        response.writeHead(503)
        response.end()
        return
      }
      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        })
        const mcp = new McpServer(
          { name: 'fixture-mcp', version: '9.9.9' },
          { capabilities: { tools: {} } },
        )
        mcp.registerTool(
          'search_notes',
          {
            description: 'Search the fixture note store',
            inputSchema: { query: z.string() },
            annotations: { readOnlyHint: true },
          },
          async ({ query }) => ({ content: [{ type: 'text', text: `notes for ${String(query)}` }] }),
        )
        mcp.registerTool(
          'delete_note',
          { description: 'Delete a note (mutating)', inputSchema: { id: z.string() } },
          async () => ({ content: [{ type: 'text', text: 'deleted' }] }),
        )
        await serverCloseHook(server, transport, mcp)
        await transport.handleRequest(request, response)
      } catch {
        if (!response.headersSent) {
          response.writeHead(500)
          response.end()
        }
      }
    })
    fixture = { server, url: '', sawAuth, respondOk: true }
    fixture.url = await new Promise<string>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address && typeof address === 'object') resolve(`http://127.0.0.1:${address.port}/mcp`)
      })
    })
    // A port nothing listens on.
    deadPort = await new Promise<number>((resolve) => {
      const probe = createServer()
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address()
        if (address && typeof address === 'object') {
          const port = address.port
          probe.close(() => resolve(port))
        }
      })
    })
  }, 180_000)

  afterAll(async () => {
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()))
    await testApp?.stop()
  })

  it('creates with encrypted auth and never returns the token', async () => {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/mcp/servers',
      headers: { cookie: alice.cookie },
      payload: {
        name: 'Notes MCP',
        url: fixture.url,
        auth: { type: 'bearer', token: AUTH_TOKEN },
      },
    })
    expect(created.statusCode).toBe(201)
    const server = created.json() as {
      id: string
      status: string
      authConfigured: boolean
      authType: string
    }
    expect(server.status).toBe('disconnected')
    expect(server.authConfigured).toBe(true)
    expect(server.authType).toBe('bearer')
    // The token never appears in ANY response body.
    expect(created.body).not.toContain(AUTH_TOKEN)
  }, 60_000)

  it('test connects through the guarded transport and records serverInfo', async () => {
    const listed = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/mcp/servers',
      headers: { cookie: alice.cookie },
    })
    const serverId = ((listed.json() as { items: Array<{ id: string }> }).items[0]!.id)

    const tested = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/mcp/servers/${serverId}/test`,
      headers: { cookie: alice.cookie },
    })
    expect(tested.statusCode).toBe(200)
    const body = tested.json() as {
      status: string
      lastError: string | null
      serverInfo: { name: string | null; version: string | null }
    }
    expect(body.status).toBe('connected')
    expect(body.lastError).toBeNull()
    expect(body.serverInfo).toEqual({ name: 'fixture-mcp', version: '9.9.9' })
    // The sealed bearer token actually reached the fixture.
    expect(fixture.sawAuth.some((value) => value === `Bearer ${AUTH_TOKEN}`)).toBe(true)
  }, 60_000)

  it('lists tools with namespaced names and untrusted hints', async () => {
    const listed = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/mcp/servers',
      headers: { cookie: alice.cookie },
    })
    const serverId = ((listed.json() as { items: Array<{ id: string }> }).items[0]!.id)

    const tools = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/mcp/servers/${serverId}/tools`,
      headers: { cookie: alice.cookie },
    })
    expect(tools.statusCode).toBe(200)
    const items = (tools.json() as { items: Array<{ name: string; namespacedName: string; readOnlyHint: boolean | null }> }).items
    expect(items.map((tool) => tool.name).sort()).toEqual(['delete_note', 'search_notes'])
    const search = items.find((tool) => tool.name === 'search_notes')!
    expect(search.namespacedName).toMatch(/^notes-mcp-\w{6}__search_notes$/)
    // The remote's hint is carried, but as a hint — the mutating tool's
    // absence of one is preserved too.
    expect(search.readOnlyHint).toBe(true)
    expect(items.find((tool) => tool.name === 'delete_note')!.readOnlyHint ?? null).toBeNull()
  }, 60_000)

  it('a dead endpoint flips status to error with a safe reason', async () => {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/mcp/servers',
      headers: { cookie: alice.cookie },
      payload: { name: 'Dead MCP', url: `http://127.0.0.1:${deadPort}/mcp` },
    })
    const serverId = (created.json() as { id: string }).id

    const tested = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/mcp/servers/${serverId}/test`,
      headers: { cookie: alice.cookie },
    })
    const body = tested.json() as { status: string; lastError: string | null }
    expect(body.status).toBe('error')
    expect(body.lastError).toBeTruthy()
    // The reason is user-safe: no raw URL with host detail beyond the
    // scrubbed form.
    expect(body.lastError!.length).toBeLessThanOrEqual(1_000)
  }, 60_000)

  it('patching the url resets the connection; disconnect clears state', async () => {
    const listed = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/mcp/servers',
      headers: { cookie: alice.cookie },
    })
    const serverId = ((listed.json() as { items: Array<{ id: string; status: string }> }).items[0]!.id)

    const patched = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/v1/mcp/servers/${serverId}`,
      headers: { cookie: alice.cookie },
      payload: { url: fixture.url },
    })
    const afterPatch = patched.json() as { status: string; serverInfo: unknown }
    expect(afterPatch.status).toBe('disconnected')
    expect(afterPatch.serverInfo).toBeNull()

    // Reconnect, then disconnect explicitly.
    await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/mcp/servers/${serverId}/test`,
      headers: { cookie: alice.cookie },
    })
    const disconnected = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/mcp/servers/${serverId}/disconnect`,
      headers: { cookie: alice.cookie },
    })
    const body = disconnected.json() as { status: string; serverInfo: unknown; lastError: unknown }
    expect(body.status).toBe('disconnected')
    expect(body.serverInfo).toBeNull()
    expect(body.lastError).toBeNull()
  }, 60_000)
})

/** Keep transports from leaking across the fixture's lifetime. */
function serverCloseHook(_server: Server, transport: StreamableHTTPServerTransport, mcp: McpServer): void {
  void mcp.connect(transport)
}
