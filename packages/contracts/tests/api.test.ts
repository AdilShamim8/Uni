import { describe, expect, it } from 'vitest'
import { API_ROOT, API_VERSION } from '../src/index.js'

/** The API constants every route and every client is built on. */
describe('API constants', () => {
  it('the version is v1 and the root is the versioned path', () => {
    expect(API_VERSION).toBe('v1')
    expect(API_ROOT).toBe('/api/v1')
  })

  it('the root embeds the version — one cannot drift from the other', () => {
    expect(API_ROOT).toContain(API_VERSION)
  })
})
