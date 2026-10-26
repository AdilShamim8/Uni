import type { FastifyInstance } from 'fastify'
import {
  createProviderRequestSchema,
  patchProviderRequestSchema,
  providerDtoSchema,
  providerTestResponseSchema,
  setCredentialRequestSchema,
} from '@uni/contracts'
import { notFound } from '../../lib/errors.js'
import {
  createProvider,
  deleteCredential,
  deleteProvider,
  discoverProviderModels,
  listProviders,
  patchProvider,
  setCredential,
  testProviderConnection,
} from './providers.service.js'

/**
 * Provider connection routes. All responses carry redacted credential
 * metadata only — the API key (encrypted or not) never appears in any
 * response body, header, or log line.
 */
export async function providersRoutes(app: FastifyInstance): Promise<void> {
  const db = app.database!.db
  const env = app.env

  app.get('/providers', async (request) => {
    const providers = await listProviders(db, request.workspace!.id)
    for (const provider of providers) {
      void providerDtoSchema.parse(provider)
    }
    return { items: providers }
  })

  app.post('/providers', async (request, reply) => {
    const body = createProviderRequestSchema.parse(request.body ?? {})
    const provider = await createProvider(db, request.workspace!.id, body)
    void providerDtoSchema.parse(provider)
    return void reply.status(201).send(provider)
  })

  app.patch<{ Params: { id: string } }>('/providers/:id', async (request, reply) => {
    const body = patchProviderRequestSchema.parse(request.body ?? {})
    const provider = await patchProvider(db, request.workspace!.id, request.params.id, body)
    void providerDtoSchema.parse(provider)
    return reply.send(provider)
  })

  app.delete<{ Params: { id: string } }>('/providers/:id', async (request, reply) => {
    const deleted = await deleteProvider(db, request.workspace!.id, request.params.id)
    if (!deleted) throw notFound('Provider not found.')
    return void reply.status(204).send()
  })

  app.put<{ Params: { id: string } }>('/providers/:id/credential', async (request, reply) => {
    const body = setCredentialRequestSchema.parse(request.body ?? {})
    const provider = await setCredential(db, env, request.workspace!.id, request.params.id, body.apiKey)
    void providerDtoSchema.parse(provider)
    return reply.send(provider)
  })

  app.delete<{ Params: { id: string } }>('/providers/:id/credential', async (request, reply) => {
    const provider = await deleteCredential(db, request.workspace!.id, request.params.id)
    void providerDtoSchema.parse(provider)
    return reply.send(provider)
  })

  app.post<{ Params: { id: string } }>('/providers/:id/test', async (request, reply) => {
    const result = await testProviderConnection(db, env, request.workspace!.id, request.params.id)
    void providerTestResponseSchema.parse(result)
    return reply.send(result)
  })

  app.post<{ Params: { id: string } }>('/providers/:id/models', async (request, reply) => {
    const result = await discoverProviderModels(db, env, request.workspace!.id, request.params.id)
    void providerTestResponseSchema.parse(result)
    return reply.send(result)
  })
}
