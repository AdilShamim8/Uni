import { describe, expect, it } from 'vitest'
import { connectorDtoSchema } from '@uni/contracts'
import {
  CONNECTOR_CATALOG,
  findConnector,
  listConnectors,
} from '../src/modules/connectors/connectors.catalog.js'

/**
 * The static connector catalog is documentation-shaped truth: every
 * entry must satisfy the shared contract, and none may claim a live
 * connection before a verified credential exists.
 */
describe('CONNECTOR_CATALOG', () => {
  it('holds the four catalog entries with unique ids', () => {
    const ids = CONNECTOR_CATALOG.map((connector) => connector.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(['github', 'gmail', 'slack', 'notion'])
  })

  it('every entry parses against the shared connector contract', () => {
    for (const connector of CONNECTOR_CATALOG) {
      expect(connectorDtoSchema.safeParse(connector).success).toBe(true)
    }
  })

  it('every entry is honestly unavailable — no fabricated live badges', () => {
    for (const connector of CONNECTOR_CATALOG) {
      expect(connector.status).toBe('unavailable')
    }
  })

  it('every entry names real setup steps and docs', () => {
    for (const connector of CONNECTOR_CATALOG) {
      expect(connector.setup.length).toBeGreaterThan(0)
      expect(connector.docsUrl.startsWith('https://')).toBe(true)
      expect(connector.routes.length).toBeGreaterThan(0)
    }
  })

  it('the GitHub entry is the T027 fixture target with read-only PAT steps', () => {
    const github = findConnector('github')
    expect(github?.kind).toBe('platform')
    expect(github?.setup[0]).toContain('read-only')
  })
})

describe('catalog accessors', () => {
  it('listConnectors returns the catalog', () => {
    expect(listConnectors()).toBe(CONNECTOR_CATALOG)
  })

  it('findConnector resolves by id and returns null for unknown ids', () => {
    expect(findConnector('github')?.name).toBe('GitHub')
    expect(findConnector('teams')).toBeNull()
  })
})
