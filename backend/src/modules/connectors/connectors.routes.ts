import type { FastifyInstance } from 'fastify'
import {
  connectorCredentialDtoSchema,
  connectorDtoSchema,
  connectorTestRequestSchema,
  connectorTestResultDtoSchema,
} from '@uni/contracts'
import { z } from 'zod'
import { AppError, badRequest, notFound } from '../../lib/errors.js'
import { findConnector, listConnectors } from './connectors.catalog.js'
import {
  describeConnectorCredential,
  openConnectorCredential,
  recordCredentialCheck,
  removeConnectorCredential,
  storeConnectorCredential,
  type ConnectorCredentialEnv,
} from './connectorCredentials.service.js'
import { verifyGithubToken } from './github.adapter.js'

/**
 * P08 / T026 — the connector catalog routes. Session-scoped like every
 * /api/v1 route (auth required) because even catalog metadata is not
 * public API surface. The status field is honestly 'unavailable' for
 * every entry until a real integration exists — these routes never
 * fabricate a live connection.
 */
export async function connectorRoutes(app: FastifyInstance): Promise<void> {
  /**
   * RF-091 — a connector is 'available' to THIS caller when a
   * verified credential exists in their workspace. The catalog rows
   * are static; the status is per-request and honest.
   */
  async function statusFor(workspaceId: string, connectorId: string): Promise<'unavailable' | 'available'> {
    const descriptor = await describeConnectorCredential(
      app.database!.db,
      workspaceId,
      connectorId,
    )
    return descriptor?.status === 'verified' ? 'available' : 'unavailable'
  }

  app.get('/connectors', async (request) => {
    const items = []
    for (const connector of listConnectors()) {
      items.push({ ...connector, status: await statusFor(request.workspace!.id, connector.id) })
    }
    for (const connector of items) void connectorDtoSchema.parse(connector)
    return { items }
  })

  app.get<{ Params: { connectorId: string } }>('/connectors/:connectorId', async (request) => {
    const connector = findConnector(request.params.connectorId)
    if (!connector) throw notFound('Connector not found.')
    const enriched = {
      ...connector,
      status: await statusFor(request.workspace!.id, connector.id),
    }
    void connectorDtoSchema.parse(enriched)
    return enriched
  })

  /**
   * RF-090 — store (replace) the connector credential. The token is
   * sealed before it touches disk; the response is the descriptor —
   * the token never comes back out.
   */
  app.put<{ Params: { connectorId: string } }>(
    '/connectors/:connectorId/credential',
    async (request, reply) => {
      const connector = findConnector(request.params.connectorId)
      if (!connector) throw notFound('Connector not found.')
      if (connector.id !== 'github') {
        throw new AppError(
          'UNAVAILABLE',
          `Credentials for "${connector.id}" cannot be stored yet — this connector is catalog-only.`,
          503,
        )
      }
      const body = z.object({ token: z.string().trim().min(1).max(400) }).parse(request.body ?? {})
      const db = app.database!.db
      const env = app.env as ConnectorCredentialEnv & { CREDENTIAL_KEY_ID: string }
      await storeConnectorCredential(db, env, request.workspace!.id, 'github', body.token)
      const descriptor = await describeConnectorCredential(db, request.workspace!.id, 'github')
      void connectorCredentialDtoSchema.parse(descriptor)
      return reply.status(201).send(descriptor)
    },
  )

  /** RF-090 — the credential descriptor (presence + status, never the token). */
  app.get<{ Params: { connectorId: string } }>(
    '/connectors/:connectorId/credential',
    async (request) => {
      const connector = findConnector(request.params.connectorId)
      if (!connector) throw notFound('Connector not found.')
      const descriptor = await describeConnectorCredential(
        app.database!.db,
        request.workspace!.id,
        connector.id,
      )
      if (!descriptor) throw notFound('No credential stored for this connector.')
      void connectorCredentialDtoSchema.parse(descriptor)
      return descriptor
    },
  )

  /** RF-090 — remove the stored credential. */
  app.delete<{ Params: { connectorId: string } }>(
    '/connectors/:connectorId/credential',
    async (request, reply) => {
      const connector = findConnector(request.params.connectorId)
      if (!connector) throw notFound('Connector not found.')
      const removed = await removeConnectorCredential(
        app.database!.db,
        request.workspace!.id,
        connector.id,
      )
      if (!removed) throw notFound('No credential stored for this connector.')
      return reply.status(204).send()
    },
  )

  /**
   * RF-089 — test a GitHub credential. With a token in the body, THAT
   * token is verified (nothing is stored). Without one, the stored
   * credential is verified and its status recorded. The adapter talks
   * to the real api.github.com; tests drive it through a stubbed fetch.
   */
  app.post<{ Params: { connectorId: string } }>(
    '/connectors/:connectorId/test',
    async (request) => {
      const connector = findConnector(request.params.connectorId)
      if (!connector) throw notFound('Connector not found.')
      if (connector.id !== 'github') {
        throw new AppError(
          'UNAVAILABLE',
          `No adapter exists for "${connector.id}" yet — this one is catalog-only today.`,
          503,
        )
      }
      const db = app.database!.db
      const env = app.env as ConnectorCredentialEnv & { CREDENTIAL_KEY_ID: string }
      const body = connectorTestRequestSchema.parse(request.body ?? {})

      let token = body.token
      let stored = false
      if (!token) {
        token = (await openConnectorCredential(db, env, request.workspace!.id, 'github')) ?? undefined
        stored = token !== undefined
        if (!token) {
          throw badRequest('No token provided and no credential is stored for GitHub.')
        }
      }

      const result = await verifyGithubToken(fetch, token)
      if (stored) {
        await recordCredentialCheck(
          db,
          request.workspace!.id,
          'github',
          result.ok,
          result.ok ? undefined : result.error,
        )
      }
      const dto = {
        connectorId: 'github',
        ok: result.ok,
        login: result.ok ? result.data.login : null,
        status: result.ok ? 200 : result.status,
        error: result.ok ? null : result.error,
      }
      void connectorTestResultDtoSchema.parse(dto)
      return dto
    },
  )
}
