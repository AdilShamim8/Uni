import type { FastifyInstance } from 'fastify'
import { buildWorkspaceExport } from './workspace.service.js'

/**
 * Workspace routes (B07): the export endpoint. Session-scoped like
 * every /api/v1 route; the workspace is server-derived so a session can
 * only ever export its own workspace's data.
 */
export async function workspaceRoutes(app: FastifyInstance): Promise<void> {
  const db = app.database!.db

  app.get('/workspace/export', async (request, reply) => {
    const exportDto = await buildWorkspaceExport(db, request.workspace!.id)
    reply.header(
      'content-disposition',
      `attachment; filename="uni-workspace-export-${new Date().toISOString().slice(0, 10)}.json"`,
    )
    return exportDto
  })
}
