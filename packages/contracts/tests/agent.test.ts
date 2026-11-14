import { describe, expect, it } from 'vitest'
import {
  AGENT_SWITCHABLE_MODES,
  agentEventsQuerySchema,
  agentModeSchema,
  agentSessionDtoSchema,
  agentSessionStatusSchema,
  createAgentSessionRequestSchema,
  isValidRootDir,
  patchAgentSessionRequestSchema,
  parseAgentModeStrict,
  permissionDecisionSchema,
  permissionDenialSchema,
  sendAgentMessageRequestSchema,
} from '../src/index.js'

/**
 * Agent sessions: modes govern approval, `unattended` is spawn-only,
 * and a rootDir must never traverse out of the workspace agent root.
 */
describe('agent mode vocabulary', () => {
  it('accepts the six modes including spawn-only unattended', () => {
    for (const mode of ['default', 'acceptEdits', 'plan', 'auto', 'yolo', 'unattended']) {
      expect(agentModeSchema.safeParse(mode).success).toBe(true)
    }
    expect(agentModeSchema.safeParse('full_access').success).toBe(false)
  })

  it('clients cannot switch INTO unattended — it is spawn-only', () => {
    expect([...AGENT_SWITCHABLE_MODES]).not.toContain('unattended')
    expect([...AGENT_SWITCHABLE_MODES]).toEqual(['default', 'acceptEdits', 'plan', 'auto', 'yolo'])
  })
})

describe('parseAgentModeStrict', () => {
  it('maps the accepted aliases, case-insensitively and trimmed', () => {
    expect(parseAgentModeStrict('default')).toBe('default')
    expect(parseAgentModeStrict(' normal ')).toBe('default')
    expect(parseAgentModeStrict('DEFAULT')).toBe('default')
    expect(parseAgentModeStrict('acceptEdits')).toBe('acceptEdits')
    expect(parseAgentModeStrict('full_access')).toBe('yolo')
    expect(parseAgentModeStrict('unattended')).toBe('unattended')
  })

  it('returns null for unknown or missing input instead of guessing', () => {
    expect(parseAgentModeStrict('autopilot')).toBeNull()
    expect(parseAgentModeStrict('')).toBeNull()
    expect(parseAgentModeStrict(undefined)).toBeNull()
  })
})

describe('session DTO + creation', () => {
  it('the DTO carries mode, status, pin, roster, and archive state', () => {
    const dto = {
      id: 'sess_1',
      name: 'Research desk',
      description: '',
      mode: 'default',
      status: 'idle',
      providerId: null,
      modelId: null,
      employeeId: null,
      rootDir: 'sessions/sess_1',
      tools: ['read', 'list'],
      archived: false,
      createdAt: 1,
      updatedAt: 1,
    }
    expect(agentSessionDtoSchema.parse(dto)).toEqual(dto)
    expect(agentSessionStatusSchema.safeParse('waiting-for-permission').success).toBe(true)
  })

  it('session creation refuses to pick the spawn-only mode', () => {
    expect(
      createAgentSessionRequestSchema.safeParse({ name: 'Desk', mode: 'unattended' }).success,
    ).toBe(false)
    expect(createAgentSessionRequestSchema.safeParse({ name: 'Desk', mode: 'plan' }).success).toBe(
      true,
    )
  })
})

describe('isValidRootDir (the F01 gate)', () => {
  it('accepts relative slash-joined safe segments and cosmetic trailing slashes', () => {
    expect(isValidRootDir('sessions/abc')).toBe(true)
    expect(isValidRootDir('sessions/abc/')).toBe(true)
    expect(isValidRootDir('proj_2026.v2')).toBe(true)
  })

  it('rejects absolute paths, traversal, backslashes, and NULs', () => {
    expect(isValidRootDir('/etc')).toBe(false)
    expect(isValidRootDir('a/../b')).toBe(false)
    expect(isValidRootDir('a/..b/c')).toBe(false)
    expect(isValidRootDir('a\\b')).toBe(false)
    expect(isValidRootDir('a\0b')).toBe(false)
  })

  it('rejects empty input, dot segments, and leading-punctuation segments', () => {
    expect(isValidRootDir('')).toBe(false)
    expect(isValidRootDir('a/./b')).toBe(false)
    expect(isValidRootDir('a/.hidden')).toBe(false)
    expect(isValidRootDir('//')).toBe(false)
  })
})

describe('session requests and permissions', () => {
  it('session creation rejects a traversing rootDir at the contract level', () => {
    expect(
      createAgentSessionRequestSchema.safeParse({ name: 'Desk', rootDir: 'a/../b' }).success,
    ).toBe(false)
    expect(
      createAgentSessionRequestSchema.safeParse({ name: 'Desk', rootDir: 'sessions/x' }).success,
    ).toBe(true)
  })

  it('a session patch with no fields is rejected', () => {
    expect(patchAgentSessionRequestSchema.safeParse({}).success).toBe(false)
    expect(patchAgentSessionRequestSchema.safeParse({ archived: true }).success).toBe(true)
  })

  it('a permission decision defaults to approving just this once', () => {
    const decision = permissionDecisionSchema.parse({ requestId: 'pr_1', decision: 'approve' })
    expect(decision.scope).toBe('once')
    expect(permissionDecisionSchema.safeParse({ requestId: 'pr_1', decision: 'maybe' }).success).toBe(
      false,
    )
  })

  it('a denial tells the model why, so it adapts instead of retrying', () => {
    const denial = permissionDenialSchema.parse({ requestId: 'pr_1', reason: 'Outside the root.' })
    expect(denial.reason).toBe('Outside the root.')
  })

  it('the replay cursor coerces and allows -1 (replay everything)', () => {
    expect(agentEventsQuerySchema.parse({})).toEqual({ after: 0 })
    expect(agentEventsQuerySchema.parse({ after: '-1' })).toEqual({ after: -1 })
    expect(agentEventsQuerySchema.safeParse({ after: '-2' }).success).toBe(false)
  })

  it('a message send is bounded and may carry an idempotency key', () => {
    expect(sendAgentMessageRequestSchema.safeParse({ text: 'Go.' }).success).toBe(true)
    expect(sendAgentMessageRequestSchema.safeParse({ text: '   ' }).success).toBe(false)
    expect(
      sendAgentMessageRequestSchema.safeParse({ text: 'x'.repeat(50_001) }).success,
    ).toBe(false)
  })
})
