import type { FastifyInstance } from 'fastify'
import {
  createFileDocumentRequestSchema,
  fileDocumentDtoSchema,
  retrievalRequestSchema,
} from '@uni/contracts'
import { notFound } from '../../lib/errors.js'
import {
  createFileDocument,
  deleteFileDocument,
  getFileDocument,
  listFileDocuments,
  retrieveKnowledge,
} from './files.service.js'

/**
 * Files & knowledge routes (P10, T034/T036). Session-scoped: the
 * workspace is server-derived; document rows and retrieval results are
 * workspace-filtered before anything is returned.
 */
export async function fileRoutes(app: FastifyInstance): Promise<void> {
  const db = app.database!.db

  app.get('/files', async (request) => {
    const items = await listFileDocuments(db, request.workspace!.id)
    for (const document of items) void fileDocumentDtoSchema.parse(document)
    return { items }
  })

  app.get<{ Params: { documentId: string } }>('/files/:documentId', async (request) => {
    const document = await getFileDocument(db, request.workspace!.id, request.params.documentId)
    if (!document) throw notFound('Document not found.')
    void fileDocumentDtoSchema.parse(document)
    return document
  })

  app.post('/files', async (request, reply) => {
    const body = createFileDocumentRequestSchema.parse(request.body ?? {})
    const document = await createFileDocument(db, request.workspace!.id, {
      title: body.title,
      fileName: body.fileName,
      content: body.content,
    })
    void fileDocumentDtoSchema.parse(document)
    return reply.status(201).send(document)
  })

  app.delete<{ Params: { documentId: string } }>('/files/:documentId', async (request, reply) => {
    const deleted = await deleteFileDocument(db, request.workspace!.id, request.params.documentId)
    if (!deleted) throw notFound('Document not found.')
    return reply.status(204).send()
  })

  app.post('/files/retrieve', async (request) => {
    const body = retrievalRequestSchema.parse(request.body ?? {})
    const hits = await retrieveKnowledge(db, request.workspace!.id, body.query, body.limit)
    return { hits, query: body.query }
  })
}
