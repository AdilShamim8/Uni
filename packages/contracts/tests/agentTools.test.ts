import { describe, expect, it } from 'vitest'
import {
  AGENT_MUTATING_TOOLS,
  AGENT_READ_TOOLS,
  AGENT_TOOL_DESCRIPTORS,
  AGENT_UNTRUSTED_OUTPUT_TOOLS,
  agentToolDescriptorDtoSchema,
  agentToolNameSchema,
  toolInputSchemas,
} from '../src/index.js'

/**
 * The agent tool roster: which tools exist, which mutate (and are
 * therefore permission-gated), and the bounded input each accepts.
 */
describe('tool roster', () => {
  it('the twelve roster names stay stable', () => {
    expect([...agentToolNameSchema.options]).toEqual([
      'read',
      'list',
      'grep',
      'write',
      'edit',
      'bash',
      'web_fetch',
      'exit_plan_mode',
      'current_time',
      'todo',
      'mcp_call',
      'knowledge_search',
    ])
    expect(agentToolNameSchema.safeParse('rm').success).toBe(false)
  })

  it('mutating, read, and untrusted-output sets are exact', () => {
    expect([...AGENT_MUTATING_TOOLS]).toEqual(['write', 'edit', 'bash', 'web_fetch'])
    expect([...AGENT_READ_TOOLS]).toEqual(['read', 'list', 'grep'])
    expect([...AGENT_UNTRUSTED_OUTPUT_TOOLS]).toEqual(['bash', 'web_fetch'])
  })

  it('every descriptor names a real roster tool', () => {
    expect(AGENT_TOOL_DESCRIPTORS.length).toBeGreaterThan(0)
    for (const descriptor of AGENT_TOOL_DESCRIPTORS) {
      expect(agentToolNameSchema.safeParse(descriptor.name).success).toBe(true)
      expect(agentToolDescriptorDtoSchema.safeParse(descriptor).success).toBe(true)
    }
  })
})

describe('tool input schemas', () => {
  it('every roster tool has exactly one input schema', () => {
    expect(Object.keys(toolInputSchemas).sort()).toEqual([...agentToolNameSchema.options].sort())
  })

  it('bash bounds its timeout at sixty seconds', () => {
    expect(toolInputSchemas.bash.safeParse({ command: 'ls' }).success).toBe(true)
    expect(toolInputSchemas.bash.safeParse({ command: 'ls', timeoutMs: 60_000 }).success).toBe(true)
    expect(toolInputSchemas.bash.safeParse({ command: 'ls', timeoutMs: 60_001 }).success).toBe(
      false,
    )
    expect(toolInputSchemas.bash.safeParse({ command: '' }).success).toBe(false)
  })

  it('file tools require a bounded path', () => {
    expect(toolInputSchemas.read.safeParse({ path: 'notes/a.txt' }).success).toBe(true)
    expect(toolInputSchemas.read.safeParse({ path: '' }).success).toBe(false)
    expect(toolInputSchemas.read.safeParse({ path: 'x'.repeat(1_001) }).success).toBe(false)
  })

  it('current_time accepts no arguments at all (strict)', () => {
    expect(toolInputSchemas.current_time.safeParse({}).success).toBe(true)
    expect(toolInputSchemas.current_time.safeParse({ tz: 'UTC' }).success).toBe(false)
  })

  it('mcp_call takes the namespaced tool plus bounded JSON args', () => {
    expect(
      toolInputSchemas.mcp_call.safeParse({ tool: 'github__list_prs', args: { limit: 5 } }).success,
    ).toBe(true)
    expect(toolInputSchemas.mcp_call.safeParse({ tool: '' }).success).toBe(false)
  })
})
