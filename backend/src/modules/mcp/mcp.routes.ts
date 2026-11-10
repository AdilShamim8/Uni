import type { FastifyInstance } from 'fastify'
import {
  createMcpServerRequestSchema,
  mcpServerDtoSchema,
  mcpToolDtoSchema,
  patchMcpServerRequestSchema,
} from '@uni/contracts'
import { notFound } from '../../lib/errors.js'
import {
  createMcpServer,
  deleteMcpServer,
  disconnectMcpServer,
  listMcpServers,
  listMcpTools,
  patchMcpServer,
  testMcpServer,
} from './mcp.service.js'

/**
 * MCP routes (T023). Workspace-scoped like every module: the workspace
 * comes from the session, never the payload. Every response body is a
 * DTO — auth material never appears.
 */
export async function mcpRoutes(app: FastifyInstance): Promise<void> {
  const db = app.database!.db
  const env = app.env

  app.get('/mcp/servers', async (request) => {
    const items = await listMcpServers(db, request.workspace!.id)
    for (const item of items) void mcpServerDtoSchema.parse(item)
    return { items }
  })

  app.post('/mcp/servers', async (request, reply) => {
    const body = createMcpServerRequestSchema.parse(request.body ?? {})
    const server = await createMcpServer(db, env, request.workspace!.id, {
      name: body.name,
      url: body.url,
      auth: body.auth,
    })
    void mcpServerDtoSchema.parse(server)
    return reply.status(201).send(server)
  })

  app.get<{ Params: { serverId: string } }>('/mcp/servers/:serverId', async (request, reply) => {
    // Convenience single fetch via the list (small N per workspace).
    const items = await listMcpServers(db, request.workspace!.id)
    const server = items.find((entry) => entry.id === request.params.serverId)
    if (!server) throw notFound('MCP server not found.')
    return reply.send(server)
  })

  app.patch<{ Params: { serverId: string } }>(
    '/mcp/servers/:serverId',
    async (request, reply) => {
      const body = patchMcpServerRequestSchema.parse(request.body ?? {})
      const server = await patchMcpServer(db, env, request.workspace!.id, request.params.serverId, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.url !== undefined ? { url: body.url } : {}),
        ...(body.auth !== undefined ? { auth: body.auth } : {}),
      })
      if (!server) throw notFound('MCP server not found.')
      return reply.send(server)
    },
  )

  app.delete<{ Params: { serverId: string } }>(
    '/mcp/servers/:serverId',
    async (request, reply) => {
      const deleted = await deleteMcpServer(db, request.workspace!.id, request.params.serverId)
      if (!deleted) throw notFound('MCP server not found.')
      return reply.status(204).send()
    },
  )

  app.post<{ Params: { serverId: string } }>(
    '/mcp/servers/:serverId/test',
    async (request, reply) => {
      const server = await testMcpServer(db, env, request.workspace!.id, request.params.serverId)
      void mcpServerDtoSchema.parse(server)
      return reply.send(server)
    },
  )

  app.post<{ Params: { serverId: string } }>(
    '/mcp/servers/:serverId/disconnect',
    async (request, reply) => {
      const server = await disconnectMcpServer(db, request.workspace!.id, request.params.serverId)
      if (!server) throw notFound('MCP server not found.')
      void mcpServerDtoSchema.parse(server)
      return reply.send(server)
    },
  )

  app.get<{ Params: { serverId: string } }>(
    '/mcp/servers/:serverId/tools',
    async (request, reply) => {
      const tools = await listMcpTools(db, env, request.workspace!.id, request.params.serverId)
      for (const tool of tools) void mcpToolDtoSchema.parse(tool)
      return reply.send({ items: tools })
    },
  )
}
