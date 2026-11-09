import { describe, expect, it } from 'vitest'
import {
  gateToolCall,
  shellSegments,
  toolPath,
  type GateOptions,
} from '../src/modules/agent/permission/gate.js'
import { isInsideDirectory, realPathOf } from '../src/modules/agent/permission/workspace-path.js'
import {
  namesSecretFile,
  secretEntries,
} from '../src/modules/agent/permission/secrets.js'
import { sourceAllows } from '../src/modules/agent/permission/tool-policy.js'
import type { ToolRequest } from '@uni/contracts'

const ROOT = '/srv/sessions/alpha'
const NOW = 1_700_000_000_000

const baseOptions = (over: Partial<GateOptions> = {}): GateOptions => ({
  mode: 'default',
  root: ROOT,
  allowedCommands: [],
  allowedTools: [],
  allowedReadPaths: [],
  allowedWritePaths: [],
  allowedOrigins: [],
  now: () => NOW,
  ...over,
})

const tool = (name: string, input: Record<string, unknown>): ToolRequest => ({
  id: 'call_1',
  name,
  input,
})

describe('toolPath — where a file argument really lands', () => {
  it('resolves a relative path inside the root', () => {
    expect(toolPath('notes/todo.md', ROOT)).toBe('/srv/sessions/alpha/notes/todo.md')
  })

  it('rejects an absolute escape', () => {
    expect(toolPath('/etc/passwd', ROOT)).toBe('/etc/passwd')
    expect(isInsideDirectory(toolPath('/etc/passwd', ROOT)!, ROOT)).toBe(false)
  })

  it('drops a leading @ and normalizes unicode spaces', () => {
    expect(toolPath('@/tmp/x', ROOT)).toBe('/tmp/x')
    expect(toolPath('my\u00A0file.md', ROOT)).toBe('/srv/sessions/alpha/my file.md')
  })

  it('expands ~ to the home directory, which is outside the root', () => {
    const home = require('node:os').homedir()
    expect(toolPath('~/.ssh/id_rsa', ROOT)).toBe(`${home}/.ssh/id_rsa`)
    expect(isInsideDirectory(toolPath('~/.ssh/id_rsa', ROOT)!, ROOT)).toBe(false)
  })

  it('reads file:// URLs as paths', () => {
    expect(toolPath('file:///etc/hosts', ROOT)).toBe('/etc/hosts')
    expect(toolPath('file://not-a-file', ROOT)).toBeNull()
  })

  it('resolves ../ escapes outside the root', () => {
    expect(isInsideDirectory(toolPath('../escape.txt', ROOT)!, ROOT)).toBe(false)
  })
})

describe('shellSegments — chained commands', () => {
  it('splits &&, ||, and ; chains', () => {
    expect(shellSegments('cd repo && git pull; ls || echo no')).toEqual([
      'cd repo',
      'git pull',
      'ls',
      'echo no',
    ])
  })

  it('drops empties', () => {
    expect(shellSegments(';;&&')).toEqual([])
  })
})

describe('gateToolCall — mode semantics', () => {
  it('yolo allows everything without asking', () => {
    const gate = gateToolCall(tool('bash', { command: 'rm -rf /' }), baseOptions({ mode: 'yolo' }))
    expect(gate).toEqual({ kind: 'allow' })
  })

  it('default asks for bash', () => {
    const gate = gateToolCall(tool('bash', { command: 'ls -la' }), baseOptions())
    expect(gate.kind).toBe('ask')
    if (gate.kind === 'ask') expect(gate.request.type).toBe('run_terminal')
  })

  it('default asks for a write inside the root', () => {
    const gate = gateToolCall(tool('write', { path: 'a.txt', content: 'x' }), baseOptions())
    expect(gate.kind).toBe('ask')
    if (gate.kind === 'ask' && gate.request.type === 'write_file') {
      // The fake root does not exist, so the write is honestly a new file.
      expect(gate.request.isNewFile).toBe(true)
    }
  })

  it('acceptEdits waves through an edit inside the root but not bash', () => {
    const edit = gateToolCall(
      tool('edit', { path: 'a.txt', oldText: 'x', newText: 'y' }),
      baseOptions({ mode: 'acceptEdits' }),
    )
    expect(edit).toEqual({ kind: 'allow' })
    const bash = gateToolCall(tool('bash', { command: 'ls' }), baseOptions({ mode: 'acceptEdits' }))
    expect(bash.kind).toBe('ask')
  })

  it('acceptEdits still asks for a write outside the root', () => {
    const gate = gateToolCall(
      tool('write', { path: '/etc/cron.d/evil', content: 'x' }),
      baseOptions({ mode: 'acceptEdits' }),
    )
    expect(gate.kind).toBe('ask')
    if (gate.kind === 'ask') expect(gate.request.type).toBe('write_outside_directory')
  })

  it('plan refuses mutations outright and explains exit_plan_mode', () => {
    const refuse = gateToolCall(
      tool('write', { path: 'a.txt', content: 'x' }),
      baseOptions({ mode: 'plan' }),
    )
    expect(refuse.kind).toBe('refuse')

    const exit = gateToolCall(
      tool('exit_plan_mode', { plan: 'Do the thing' }),
      baseOptions({ mode: 'plan' }),
    )
    expect(exit.kind).toBe('ask')
    if (exit.kind === 'ask' && exit.request.type === 'exit_plan_mode') {
      expect(exit.request.planContent).toBe('Do the thing')
    }
  })

  it('plan refuses web_fetch as an outbound channel', () => {
    const gate = gateToolCall(
      tool('web_fetch', { url: 'https://example.com/page' }),
      baseOptions({ mode: 'plan' }),
    )
    expect(gate.kind).toBe('refuse')
  })

  it('exit_plan_mode outside plan mode is refused, not asked', () => {
    const gate = gateToolCall(tool('exit_plan_mode', {}), baseOptions())
    expect(gate.kind).toBe('refuse')
  })

  it('reads inside the root never prompt', () => {
    const gate = gateToolCall(tool('read', { path: 'src/index.ts' }), baseOptions())
    expect(gate).toEqual({ kind: 'allow' })
  })

  it('a read outside the root asks with the resolved path', () => {
    const gate = gateToolCall(tool('read', { path: '/etc/hostname' }), baseOptions())
    expect(gate.kind).toBe('ask')
    if (gate.kind === 'ask' && gate.request.type === 'read_outside_directory') {
      expect(gate.request.resolvedPath).toBe('/etc/hostname')
    }
  })

  it('an approved command prefix auto-allows the exact and prefixed command', () => {
    const opts = baseOptions({ allowedCommands: ['git status'] })
    expect(gateToolCall(tool('bash', { command: 'git status' }), opts)).toEqual({ kind: 'allow' })
    expect(gateToolCall(tool('bash', { command: 'git status --short' }), opts)).toEqual({
      kind: 'allow',
    })
    // The prefix is the first word: a different command does not match.
    expect(gateToolCall(tool('bash', { command: 'git push' }), opts).kind).toBe('ask')
  })

  it('a chained command matches only when every segment clears', () => {
    const opts = baseOptions({ allowedCommands: ['git status'] })
    expect(gateToolCall(tool('bash', { command: 'git status && ls' }), opts).kind).toBe('ask')
    const opts2 = baseOptions({ allowedCommands: ['git status', 'ls'] })
    expect(gateToolCall(tool('bash', { command: 'git status && ls' }), opts2)).toEqual({
      kind: 'allow',
    })
  })

  it('shell chaining characters never auto-allow', () => {
    const opts = baseOptions({ allowedCommands: ['git status'] })
    expect(gateToolCall(tool('bash', { command: 'git status; rm -rf .' }), opts).kind).toBe('ask')
    expect(gateToolCall(tool('bash', { command: 'git status | sh' }), opts).kind).toBe('ask')
    expect(gateToolCall(tool('bash', { command: 'git status >> ~/.zshrc' }), opts).kind).toBe('ask')
    expect(gateToolCall(tool('bash', { command: 'git status $(whoami)' }), opts).kind).toBe('ask')
  })

  it('web_fetch asks per origin and an allowed origin auto-allows', () => {
    const ask = gateToolCall(
      tool('web_fetch', { url: 'https://docs.example.com/a?x=1' }),
      baseOptions(),
    )
    expect(ask.kind).toBe('ask')
    if (ask.kind === 'ask') {
      expect(ask.request.type).toBe('fetch_url')
      if (ask.request.type === 'fetch_url') {
        // The full URL: the query string is where a payload would sit.
        expect(ask.request.url).toBe('https://docs.example.com/a?x=1')
        expect(ask.request.origin).toBe('https://docs.example.com')
      }
    }
    const opts = baseOptions({ allowedOrigins: ['https://docs.example.com'] })
    expect(
      gateToolCall(tool('web_fetch', { url: 'https://docs.example.com/b' }), opts),
    ).toEqual({ kind: 'allow' })
    expect(
      gateToolCall(tool('web_fetch', { url: 'https://other.example.com/' }), opts).kind,
    ).toBe('ask')
  })

  it('an unparseable URL passes through to fail at the fetch', () => {
    const gate = gateToolCall(tool('web_fetch', { url: 'not-a-url' }), baseOptions())
    expect(gate).toEqual({ kind: 'allow' })
  })

  it('an always-allowed tool name auto-allows (except bash and web_fetch)', () => {
    const opts = baseOptions({ allowedTools: ['edit'] })
    expect(gateToolCall(tool('edit', { path: 'a', oldText: 'x', newText: 'y' }), opts)).toEqual({
      kind: 'allow',
    })
    // bash and web_fetch have narrower stores; the blanket list does not cover them.
    expect(gateToolCall(tool('bash', { command: 'ls' }), opts).kind).toBe('ask')
  })
})

describe('gateToolCall — unattended rules', () => {
  const unattended = (over: Partial<GateOptions> = {}): GateOptions =>
    baseOptions({
      mode: 'unattended',
      unattended: { policy: { files: true, sources: [] } },
      ...over,
    })

  it('without a policy, everything is refused', () => {
    const gate = gateToolCall(tool('read', { path: 'a.txt' }), baseOptions({ mode: 'unattended' }))
    expect(gate.kind).toBe('refuse')
  })

  it('workspace-read allows reads inside the root', () => {
    const gate = gateToolCall(tool('read', { path: 'a.txt' }), unattended())
    expect(gate).toEqual({ kind: 'allow' })
  })

  it('workspace-read refuses reads outside the root even with allowances', () => {
    const gate = gateToolCall(
      tool('read', { path: '/etc/hostname' }),
      unattended({ allowedReadPaths: ['/etc'] }),
    )
    expect(gate.kind).toBe('refuse')
  })

  it('bash and write are refused with their named reasons', () => {
    const bash = gateToolCall(tool('bash', { command: 'ls' }), unattended())
    expect(bash.kind).toBe('refuse')
    if (bash.kind === 'refuse')
      expect(bash.reason).toContain('never runs shell commands unattended')
    const write = gateToolCall(tool('write', { path: 'a', content: 'x' }), unattended())
    expect(write.kind).toBe('refuse')
  })

  it('a secret-named file is refused unattended even inside the root', () => {
    const gate = gateToolCall(tool('read', { path: '.env' }), unattended())
    expect(gate.kind).toBe('refuse')
  })

  it('files=false refuses workspace reads entirely', () => {
    const gate = gateToolCall(
      tool('read', { path: 'a.txt' }),
      baseOptions({
        mode: 'unattended',
        unattended: { policy: { files: false, sources: [] } },
      }),
    )
    expect(gate.kind).toBe('refuse')
  })
})

describe('secrets — named stores and secret file names', () => {
  it('names secret files by base name wherever they appear', () => {
    expect(namesSecretFile('project/.env')).toBe(true)
    expect(namesSecretFile('config/credentials.json')).toBe(true)
    expect(namesSecretFile('src/index.ts')).toBe(false)
  })

  it('secretEntries covers ssh, aws, and the uni home', () => {
    const paths = secretEntries('/home/tester').map((e) => e.path)
    expect(paths).toContain('/home/tester/.ssh')
    expect(paths).toContain('/home/tester/.aws')
    expect(paths).toContain('/home/tester/.uni')
  })
})

describe('tool-policy — source allowlisting', () => {
  it('no sources means no fetches', () => {
    expect(sourceAllows('https://a.example/x', [], true)).toBe(false)
  })

  it('exact and prefix matches allow; others refuse', () => {
    const sources = ['https://docs.example.com/page']
    expect(sourceAllows('https://docs.example.com/page', sources, true)).toBe(true)
    expect(sourceAllows('https://docs.example.com/page/sub', sources, true)).toBe(true)
    expect(sourceAllows('https://docs.example.com/other', sources, true)).toBe(false)
    expect(sourceAllows('https://evil.example/', sources, true)).toBe(false)
  })
})

describe('workspace-path — containment with links', () => {
  it('a resolvable but missing path is still judged by its nearest ancestor', () => {
    // /tmp exists everywhere; a file under it resolves inside /tmp.
    expect(isInsideDirectory('/tmp/x/y.txt', '/tmp')).toBe(true)
    expect(isInsideDirectory('/etc/passwd', '/tmp')).toBe(false)
  })

  it('realPathOf returns null only on unresolvable chains', () => {
    expect(realPathOf('/')).toBe('/')
    expect(typeof realPathOf('/definitely/not/here/but/parents/exist')).toBe('string')
  })
})
