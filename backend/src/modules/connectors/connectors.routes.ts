import type { FastifyInstance } from 'fastify'
import { connectorDtoSchema } from '@uni/contracts'
import { notFound } from '../../lib/errors.js'
import { findConnector, listConnectors } from './connectors.catalog.js'

/**
 * P08 / T026 — the connector catalog routes. Session-scoped like every
 * /api/v1 route (auth required) because even catalog metadata is not
 * public API surface. The status field is honestly 'unavailable' for
 * every entry until a real integration exists — these routes never
 * fabricate a live connection.
 */
export async function connectorRoutes(app: FastifyInstance): Promise<void> {
  app.get('/connectors', async () => {
    const items = listConnectors()
    for (const connector of items) void connectorDtoSchema.parse(connector)
    return { items }
  })

  app.get<{ Params: { connectorId: string } }>('/connectors/:connectorId', async (request) => {
    const connector = findConnector(request.params.connectorId)
    if (!connector) throw notFound('Connector not found.')
    void connectorDtoSchema.parse(connector)
    return connector
  })
}
