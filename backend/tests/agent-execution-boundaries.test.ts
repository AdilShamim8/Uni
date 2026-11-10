import { describe, expect, it } from 'vitest'
import { gateToolCall, type GateOptions } from '../src/modules/agent/permission/gate.js'
import { executeTool, toolContextFor, shellExecutionAvailable } from '../src/modules/agent/roster.js'
import type { ToolRequest } from '@uni/contracts'
import type { Env } from '../src/config/env.js'

/**
 * F07 regression suite: hosted execution boundaries. The shell tool is
 * inert on the host until an isolated execution worker exists; no mode
 * (default/acceptEdits/auto/yolo/unattended) may cross tenant or host
 * boundaries.
 */

const testEnv: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  HOST: '127.0.0.1',
  LOG_LEVEL: 'fatal',
  CORS_ORIGINS: '',
  APP_URL: 'http://127.0.0.1:4000',
  AUTH_REGISTRATION: 'open',
  AUTH_TRUSTED_PROXIES: '',
  CREDENTIAL_MASTER_KEY: undefined,
  CREDENTIAL_KEY_ID: 'test-key-1',
  ALLOW_LOCAL_MODEL_ENDPOINTS: 'false',
  LOCAL_MODEL_ENDPOINT_ALLOWLIST: '',
  FRONTEND_DIST_DIR: '',
  RUN_TIMEOUT_MS: 15_000,
  RUN_MAX_OUTPUT_TOKENS: 512,
  RUN_HISTORY_MAX_CHARS: 8_000,
  RUN_MAX_CONCURRENT_PER_WORKSPACE: 2,
  RUN_CREATE_RATE_PER_MINUTE: 60,
}

function gateOptions(overrides: Partial<GateOptions> = {}): GateOptions {
  return {
    mode: 'default',
    root: '/tmp/uni-agent-root/wsA/sessions/s1',
    allowedCommands: [],
    allowedTools: [],
    allowedOrigins: [],
    allowedReadPaths: [],
    allowedWritePaths: [],
    ...overrides,
  }
}

function toolRequest(name: string, input: Record<string, unknown>): ToolRequest {
  return { id: `call_${name}`, name, input }
}

describe('F07 hosted execution boundaries', () => {
  it('the host shell is unavailable by default and says so explicitly', async () => {
    delete process.env.UNI_AGENT_ISOLATED_EXECUTION
    expect(shellExecutionAvailable()).toBe(false)
    const ctx = toolContextFor('/tmp/uni-agent-root/wsA/sessions/s1', testEnv)
    const outcome = await executeTool('bash', ctx, { command: 'cat /etc/passwd' })
    expect(outcome.ok).toBe(false)
    expect(outcome.output).toContain('unavailable')
    expect(outcome.output).not.toContain('root:') // never executed
  })

  it('yolo mode cannot make the host shell run', async () => {
    delete process.env.UNI_AGENT_ISOLATED_EXECUTION
    // The GATE would allow it (yolo never asks) — the executor is the
    // boundary that holds. This is the exact F07 invariant: approval
    // vocabulary from a desktop model must not grant host execution.
    const gate = gateToolCall(toolRequest('bash', { command: 'ls' }), gateOptions({ mode: 'yolo' }))
    expect(gate.kind).toBe('allow')
    const ctx = toolContextFor('/tmp/uni-agent-root/wsA/sessions/s1', testEnv)
    const outcome = await executeTool('bash', ctx, { command: 'ls' })
    expect(outcome.ok).toBe(false)
    expect(outcome.output).toContain('unavailable')
  })

  it('auto mode and an approved command prefix still cannot make the host shell run', async () => {
    delete process.env.UNI_AGENT_ISOLATED_EXECUTION
    const gate = gateToolCall(
      toolRequest('bash', { command: 'git status' }),
      gateOptions({ mode: 'auto', allowedCommands: ['git'] }),
    )
    expect(gate.kind).toBe('allow')
    const ctx = toolContextFor('/tmp/uni-agent-root/wsA/sessions/s1', testEnv)
    const outcome = await executeTool('bash', ctx, { command: 'git status' })
    expect(outcome.ok).toBe(false)
  })

  it('no mode can read a file outside the session root without an ask', () => {
    const modes: Array<GateOptions['mode']> = ['default', 'acceptEdits', 'plan', 'auto']
    for (const mode of modes) {
      const gate = gateToolCall(
        toolRequest('read', { path: '../../other-workspace/secret.txt' }),
        gateOptions({ mode }),
      )
      // Every interactive mode asks before the read leaves the root.
      expect(gate.kind).toBe('ask')
    }
  })

  it('yolo is the only no-prompt mode and still confines file tools to the root at execution', async () => {
    const ctx = toolContextFor('/tmp/uni-agent-root/wsA/sessions/s1', testEnv)
    // The gate allows everything in yolo; the EXECUTOR must still refuse
    // paths that resolve outside the root (containment at run time).
    const gate = gateToolCall(
      toolRequest('read', { path: '/etc/passwd' }),
      gateOptions({ mode: 'yolo' }),
    )
    expect(gate.kind).toBe('allow')
    const outcome = await executeTool('read', ctx, { path: '/etc/passwd' })
    expect(outcome.ok).toBe(false)
    expect(outcome.output).toContain('outside the session root')
  })

  it('unattended refuses everything except its allowlist, whatever the session allowed before', () => {
    const gate = gateToolCall(
      toolRequest('bash', { command: 'echo hi' }),
      gateOptions({
        mode: 'unattended',
        allowedCommands: ['echo'],
        unattended: { policy: { files: true, sources: [] } },
      }),
    )
    expect(gate.kind).toBe('refuse')
    const write = gateToolCall(
      toolRequest('write', { path: 'x.txt', content: 'y' }),
      gateOptions({
        mode: 'unattended',
        unattended: { policy: { files: true, sources: [] } },
      }),
    )
    expect(write.kind).toBe('refuse')
  })
})
