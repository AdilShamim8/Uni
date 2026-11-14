import { describe, expect, it } from 'vitest'
import {
  connectorCategorySchema,
  connectorCredentialDtoSchema,
  connectorDtoSchema,
  connectorKindSchema,
  connectorTestRequestSchema,
  connectorTestResultDtoSchema,
} from '../src/index.js'

/**
 * The connector catalog: honestly not connected until a verified
 * credential exists; the stored token itself is never in any DTO.
 */
describe('connector vocabulary', () => {
  it('kinds are platform/messaging/mcp', () => {
    expect(connectorKindSchema.safeParse('platform').success).toBe(true)
    expect(connectorKindSchema.safeParse('messaging').success).toBe(true)
    expect(connectorKindSchema.safeParse('mcp').success).toBe(true)
    expect(connectorKindSchema.safeParse('database').success).toBe(false)
  })

  it('the nine categories stay stable', () => {
    expect([...connectorCategorySchema.options]).toEqual([
      'messaging',
      'featured',
      'development',
      'productivity',
      'data',
      'infrastructure',
      'web',
      'payments',
      'support',
    ])
  })
})

describe('connector DTO', () => {
  const dto = {
    id: 'github',
    name: 'GitHub',
    description: 'Read repositories and issues.',
    kind: 'platform',
    category: 'development',
    docsUrl: 'https://docs.github.com/rest',
    routes: ['List my open pull requests'],
    setup: ['Create a fine-grained personal access token'],
    status: 'unavailable',
  }

  it('accepts an honest not-connected catalog entry', () => {
    expect(connectorDtoSchema.parse(dto)).toEqual(dto)
    expect(connectorDtoSchema.safeParse({ ...dto, status: 'available' }).success).toBe(true)
    expect(connectorDtoSchema.safeParse({ ...dto, status: 'live' }).success).toBe(false)
  })

  it('requires a real docs URL and bounds the route/setup lists', () => {
    expect(connectorDtoSchema.safeParse({ ...dto, docsUrl: 'not-a-url' }).success).toBe(false)
    expect(
      connectorDtoSchema.safeParse({ ...dto, routes: Array.from({ length: 21 }, () => 'r') }).success,
    ).toBe(false)
    expect(
      connectorDtoSchema.safeParse({ ...dto, setup: Array.from({ length: 21 }, () => 's') }).success,
    ).toBe(false)
  })
})

describe('connector credentials and tests', () => {
  it('the credential view exposes verification state, never the token', () => {
    const credential = {
      connectorId: 'github',
      status: 'verified',
      lastCheckedAt: 1,
      lastError: null,
    }
    expect(connectorCredentialDtoSchema.parse(credential)).toEqual(credential)
    expect(Object.keys(connectorCredentialDtoSchema.shape)).not.toContain('token')
  })

  it('a token test request is optional but bounded when present', () => {
    expect(connectorTestRequestSchema.safeParse({}).success).toBe(true)
    expect(connectorTestRequestSchema.safeParse({ token: 'github_pat_x' }).success).toBe(true)
    expect(connectorTestRequestSchema.safeParse({ token: '' }).success).toBe(false)
    expect(connectorTestRequestSchema.safeParse({ token: 'x'.repeat(401) }).success).toBe(false)
  })

  it('a test result reports upstream status 0 for unreachable endpoints', () => {
    const result = {
      connectorId: 'github',
      ok: false,
      login: null,
      status: 0,
      error: 'GitHub is unreachable.',
    }
    expect(connectorTestResultDtoSchema.parse(result)).toEqual(result)
    expect(connectorTestResultDtoSchema.safeParse({ ...result, status: -1 }).success).toBe(false)
  })
})
