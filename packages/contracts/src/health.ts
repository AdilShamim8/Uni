import { z } from 'zod'

/**
 * Liveness: the process is up. Never touches dependencies.
 */
export const healthLiveSchema = z.object({
  status: z.literal('live'),
})

export type HealthLive = z.infer<typeof healthLiveSchema>

/**
 * Readiness: required dependencies answer without exposing sensitive
 * details (no connection strings, no hostnames, no versions).
 */
export const healthReadySchema = z.object({
  status: z.enum(['ready', 'unavailable']),
  checks: z.object({
    database: z.object({
      status: z.enum(['up', 'down']),
    }),
  }),
})

export type HealthReady = z.infer<typeof healthReadySchema>
