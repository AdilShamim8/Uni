import { describe, expect, it } from 'vitest'
import { pageQuerySchema, pageSchema } from '../src/index.js'

/**
 * Cursor pagination primitives shared by every list endpoint: opaque
 * cursors, server-bounded limits, coerced from query strings.
 */
describe('page query contract', () => {
  it('defaults the limit to 50 when only a cursor is given', () => {
    expect(pageQuerySchema.parse({ cursor: 'opaque' })).toEqual({ cursor: 'opaque', limit: 50 })
  })

  it('coerces string limits the way query strings arrive', () => {
    expect(pageQuerySchema.parse({ limit: '25' })).toEqual({ limit: 25 })
  })

  it('keeps limits inside the server-side bound (1..100, integers)', () => {
    expect(pageQuerySchema.safeParse({ limit: 0 }).success).toBe(false)
    expect(pageQuerySchema.safeParse({ limit: 101 }).success).toBe(false)
    expect(pageQuerySchema.safeParse({ limit: 1.5 }).success).toBe(false)
    expect(pageQuerySchema.safeParse({ limit: 1 }).success).toBe(true)
    expect(pageQuerySchema.safeParse({ limit: 100 }).success).toBe(true)
  })

  it('rejects empty cursors but accepts any non-empty opaque string', () => {
    expect(pageQuerySchema.safeParse({ cursor: '' }).success).toBe(false)
    expect(pageQuerySchema.safeParse({ cursor: 'eyJvZmZzZXQiOjEwfQ' }).success).toBe(true)
  })
})

describe('page contract', () => {
  it('holds items plus a nullable next cursor', () => {
    expect(pageSchema.safeParse({ items: [], nextCursor: null }).success).toBe(true)
    expect(pageSchema.safeParse({ items: [{ id: 'a' }], nextCursor: 'next' }).success).toBe(true)
    expect(pageSchema.safeParse({ items: [], nextCursor: 7 }).success).toBe(false)
  })
})
