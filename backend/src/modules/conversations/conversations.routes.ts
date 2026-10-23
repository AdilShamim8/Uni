import type { FastifyInstance } from 'fastify'
import {
  conversationDetailDtoSchema,
  conversationListQuerySchema,
  conversationSummaryDtoSchema,
  createConversationRequestSchema,
  createNodeRequestSchema,
  messageNodeDtoSchema,
  patchConversationRequestSchema,
  pageSchema,
  type ConversationDetailDto,
  type ConversationSummaryDto,
  type CreateNodeRequest,
  type MessageNodeDto,
  type Page,
} from '@uni/contracts'
import { notFound } from '../../lib/errors.js'
import {
  createConversation,
  createNode,
  deleteConversation,
  getConversation,
  listConversations,
  patchConversation,
} from './conversations.service.js'

/**
 * Owned conversation CRUD + message-tree persistence. Every route is
 * session-scoped (preHandler) and workspace-scoped (service filters);
 * IDs from other workspaces resolve to 404 without existence leaks.
 */
export async function conversationsRoutes(app: FastifyInstance): Promise<void> {
  const db = app.database!.db

  app.get<{ Reply: Page<ConversationSummaryDto> }>(
    '/conversations',
    async (request) => {
      const query = conversationListQuerySchema.parse(request.query)
      return listConversations(db, request.workspace!.id, query)
    },
  )

  app.post<{ Body: unknown; Reply: ConversationSummaryDto }>(
    '/conversations',
    async (request, reply) => {
      const body = createConversationRequestSchema.parse(request.body ?? {})
      const conversation = await createConversation(db, request.workspace!.id, body)
      void conversationSummaryDtoSchema.parse(conversation) // response honors the contract
      return void reply.status(201).send(conversation)
    },
  )

  app.get<{ Params: { id: string }; Reply: ConversationDetailDto }>(
    '/conversations/:id',
    async (request, reply) => {
      const conversation = await getConversation(db, request.workspace!.id, request.params.id)
      if (!conversation) {
        throw notFound('Conversation not found.')
      }
      void conversationDetailDtoSchema.parse(conversation)
      return reply.send(conversation)
    },
  )

  app.patch<{ Params: { id: string }; Body: unknown; Reply: ConversationDetailDto }>(
    '/conversations/:id',
    async (request, reply) => {
      const body = patchConversationRequestSchema.parse(request.body ?? {})
      const conversation = await patchConversation(db, request.workspace!.id, request.params.id, body)
      void conversationDetailDtoSchema.parse(conversation)
      return reply.send(conversation)
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/conversations/:id',
    async (request, reply) => {
      const deleted = await deleteConversation(db, request.workspace!.id, request.params.id)
      if (!deleted) {
        throw notFound('Conversation not found.')
      }
      return void reply.status(204).send()
    },
  )

  app.post<{
    Params: { id: string }
    Body: CreateNodeRequest
    Reply: { node: MessageNodeDto; conversation: ConversationDetailDto; reused: boolean }
  }>('/conversations/:id/nodes', async (request, reply) => {
    const body = createNodeRequestSchema.parse(request.body ?? {})
    const result = await createNode(db, request.workspace!.id, request.params.id, body)
    if (!result) {
      throw notFound('Conversation not found.')
    }
    void messageNodeDtoSchema.parse(result.node)
    return void reply.status(result.reused ? 200 : 201).send(result)
  })
}
