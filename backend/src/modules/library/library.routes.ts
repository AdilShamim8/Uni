import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  canonicalSaveResultSchema,
  createLibraryArtifactRequestSchema,
  libraryArtifactDtoSchema,
  libraryArtifactVersionDtoSchema,
  patchLibraryArtifactRequestSchema,
} from '@uni/contracts'
import { notFound } from '../../lib/errors.js'
import {
  canonicalSave,
  createArtifact,
  deleteArtifact,
  getArtifact,
  listArtifactVersions,
  listArtifacts,
  patchArtifact,
} from './library.service.js'

const canonicalSaveRequestSchema = z.object({
  title: z.string().trim().min(1).max(300),
  kind: createLibraryArtifactRequestSchema.shape.kind,
  markdown: z.string().min(1).max(500_000),
  provenance: createLibraryArtifactRequestSchema.shape.provenance,
  generatedBy: createLibraryArtifactRequestSchema.shape.generatedBy,
  taskId: z.string().trim().min(1).max(200).nullable(),
  sourceConversationId: z.string().trim().min(1).max(200).nullable(),
  sourceMessageId: z.string().trim().min(1).max(200).nullable(),
  linkedArtifactId: z.string().trim().min(1).max(200).nullable(),
})

/**
 * Library routes. The canonical-save endpoint is the ONE operation per
 * source of truth — Work reports and saved replies both flow through
 * it so they cannot drift apart.
 */
export async function libraryRoutes(app: FastifyInstance): Promise<void> {
  const db = app.database!.db

  app.get('/library/artifacts', async (request) => {
    const items = await listArtifacts(db, request.workspace!.id)
    for (const artifact of items) {
      void libraryArtifactDtoSchema.parse(artifact)
    }
    return { items }
  })

  app.post('/library/artifacts', async (request, reply) => {
    const body = createLibraryArtifactRequestSchema.parse(request.body ?? {})
    const artifact = await createArtifact(db, request.workspace!.id, body)
    void libraryArtifactDtoSchema.parse(artifact)
    return void reply.status(201).send(artifact)
  })

  app.get<{ Params: { id: string } }>('/library/artifacts/:id', async (request) => {
    const artifact = await getArtifact(db, request.workspace!.id, request.params.id)
    void libraryArtifactDtoSchema.parse(artifact)
    return artifact
  })

  app.get<{ Params: { id: string } }>('/library/artifacts/:id/versions', async (request) => {
    const items = await listArtifactVersions(db, request.workspace!.id, request.params.id)
    for (const version of items) {
      void libraryArtifactVersionDtoSchema.parse(version)
    }
    return { items }
  })

  app.patch<{ Params: { id: string } }>('/library/artifacts/:id', async (request, reply) => {
    const body = patchLibraryArtifactRequestSchema.parse(request.body ?? {})
    const artifact = await patchArtifact(db, request.workspace!.id, request.params.id, body)
    void libraryArtifactDtoSchema.parse(artifact)
    return reply.send(artifact)
  })

  app.delete<{ Params: { id: string } }>('/library/artifacts/:id', async (request, reply) => {
    const deleted = await deleteArtifact(db, request.workspace!.id, request.params.id)
    if (!deleted) throw notFound('Artifact not found.')
    return void reply.status(204).send()
  })

  app.post('/library/canonical-save', async (request, reply) => {
    const body = canonicalSaveRequestSchema.parse(request.body ?? {})
    const result = await canonicalSave(db, request.workspace!.id, {
      title: body.title,
      kind: body.kind,
      markdown: body.markdown,
      provenance: body.provenance ?? 'demo-simulation',
      generatedBy: body.generatedBy ?? null,
      taskId: body.taskId,
      sourceConversationId: body.sourceConversationId,
      sourceMessageId: body.sourceMessageId,
      linkedArtifactId: body.linkedArtifactId,
    })
    void canonicalSaveResultSchema.parse(result)
    return reply.send(result)
  })
}
