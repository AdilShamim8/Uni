import type { FastifyInstance } from 'fastify'
import {
  importCommitResponseSchema,
  importPreviewResponseSchema,
} from '@uni/contracts'
import { commitImport, previewImport } from './importer.service.js'

/**
 * Deliberate import: dry-run preview first, explicit commit second.
 * Imports only happen on this explicit action into the signed-in
 * workspace — local data is never uploaded implicitly.
 */
export async function importerRoutes(app: FastifyInstance): Promise<void> {
  const db = app.database!.db

  app.post<{ Body: unknown }>('/import/preview', async (request) => {
    const preview = previewImport(request.body)
    void importPreviewResponseSchema.parse(preview)
    return preview
  })

  app.post<{ Body: unknown }>('/import/commit', async (request) => {
    const result = await commitImport(db, request.workspace!.id, request.body)
    void importCommitResponseSchema.parse(result)
    return result
  })
}
