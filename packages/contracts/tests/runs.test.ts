import { describe, expect, it } from 'vitest'
import {
  RUN_TERMINAL_STATUSES,
  createRunRequestSchema,
  runDtoSchema,
  runEventSchema,
  runEventsQuerySchema,
  runStatusSchema,
} from '../src/index.js'

/** Run lifecycle: one model execution answering a user node, evented. */
describe('run status vocabulary', () => {
  it('accepts the six run statuses', () => {
    for (const status of ['running', 'cancelling', 'complete', 'stopped', 'repetition_stopped', 'error']) {
      expect(runStatusSchema.safeParse(status).success).toBe(true)
    }
    expect(runStatusSchema.safeParse('failed').success).toBe(false)
  })

  it('the terminal set is exactly the four truthful outcomes', () => {
    expect([...RUN_TERMINAL_STATUSES]).toEqual(['complete', 'stopped', 'repetition_stopped', 'error'])
  })
})

describe('run events', () => {
  it('an event carries a per-run monotonic sequence', () => {
    const event = {
      eventId: 'ev_1',
      runId: 'run_1',
      sequence: 0,
      type: 'started',
      timestamp: 1_700_000_000_000,
      payload: { text: '' },
    }
    expect(runEventSchema.parse(event)).toEqual(event)
    expect(
      runEventSchema.safeParse({ ...event, sequence: -1 }).success,
    ).toBe(false)
  })

  it('the replay cursor defaults to zero and coerces strings', () => {
    expect(runEventsQuerySchema.parse({})).toEqual({ after: 0 })
    expect(runEventsQuerySchema.parse({ after: '42' })).toEqual({ after: 42 })
  })
})

describe('run creation and DTO', () => {
  it('creation requires the parent node and the provider', () => {
    expect(
      createRunRequestSchema.safeParse({ parentNodeId: 'nd_1', providerId: 'prov_1' }).success,
    ).toBe(true)
    expect(createRunRequestSchema.safeParse({ providerId: 'prov_1' }).success).toBe(false)
    expect(
      createRunRequestSchema.safeParse({
        parentNodeId: 'nd_1',
        providerId: 'prov_1',
        idempotencyKey: 'retry-1',
      }).success,
    ).toBe(true)
  })

  it('the DTO pins the provider kind to the two protocols', () => {
    const dto = {
      id: 'run_1',
      conversationId: 'cv_1',
      parentNodeId: 'nd_1',
      providerId: 'prov_1',
      providerKind: 'anthropic',
      providerEndpoint: 'https://api.anthropic.com/v1',
      modelId: 'claude-3',
      status: 'complete',
      outputText: 'Done.',
      usage: { inputTokens: 10, outputTokens: 5 },
      errorCode: null,
      errorMessage: null,
      createdAt: 1,
      updatedAt: 1,
      terminalAt: 1,
    }
    expect(runDtoSchema.parse(dto)).toEqual(dto)
    expect(runDtoSchema.safeParse({ ...dto, providerKind: 'google' }).success).toBe(false)
  })
})
