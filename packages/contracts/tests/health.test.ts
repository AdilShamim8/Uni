import { describe, expect, it } from 'vitest'
import { healthLiveSchema, healthReadySchema } from '../src/index.js'

/**
 * Liveness never touches dependencies; readiness reports the database
 * axis without leaking hostnames, versions, or connection strings.
 */
describe('health contracts', () => {
  it('liveness accepts exactly the live literal', () => {
    expect(healthLiveSchema.safeParse({ status: 'live' }).success).toBe(true)
    expect(healthLiveSchema.safeParse({ status: 'dead' }).success).toBe(false)
  })

  it('readiness accepts ready and unavailable with an up/down database axis', () => {
    expect(
      healthReadySchema.safeParse({ status: 'ready', checks: { database: { status: 'up' } } })
        .success,
    ).toBe(true)
    expect(
      healthReadySchema.safeParse({
        status: 'unavailable',
        checks: { database: { status: 'down' } },
      }).success,
    ).toBe(true)
  })

  it('readiness rejects unknown statuses and axis values', () => {
    expect(
      healthReadySchema.safeParse({ status: 'degraded', checks: { database: { status: 'up' } } })
        .success,
    ).toBe(false)
    expect(
      healthReadySchema.safeParse({ status: 'ready', checks: { database: { status: 'maybe' } } })
        .success,
    ).toBe(false)
  })
})
