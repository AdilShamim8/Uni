import { describe, expect, it } from 'vitest'
import {
  AGENT_SWITCHABLE_MODES,
  agentModeSchema,
  agentSessionDtoSchema,
  agentSessionStatusSchema,
  createAgentSessionRequestSchema,
  isValidRootDir,
  parseAgentModeStrict,
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
