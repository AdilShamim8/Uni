import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  deriveSessionRootDir,
  ensureSessionRoot,
  sessionRootPath,
  UnsafeRootDirError,
} from '../src/modules/agent/sessionStore.js'
import { isValidRootDir } from '@uni/contracts'
import { isInsideDirectory } from '../src/modules/agent/permission/workspace-path.js'

/**
 * F01 regression suite: session roots are server-owned, unique and
 * contained. Pure-path cases run without a database; the file-based
 * containment cases use a temp agent root.
 */
describe('F01 session root safety', () => {
  it('isValidRootDir accepts only relative safe paths', () => {
    expect(isValidRootDir('sessions/abc')).toBe(true)
    expect(isValidRootDir('work/sub-dir_2')).toBe(true)
    expect(isValidRootDir('sessions/abc/')).toBe(true)
    expect(isValidRootDir('/etc/passwd')).toBe(false)
    expect(isValidSessionEscape('sessions/../../workspaceB/session')).toBe(false)
    expect(isValidSessionEscape('sessions/..')).toBe(false)
    expect(isValidSessionEscape('a/./b')).toBe(false)
    expect(isValidSessionEscape('a\\b')).toBe(false)
    expect(isValidSessionEscape('..hidden/ok')).toBe(false)
    expect(isValidSessionEscape('')).toBe(false)
    expect(isValidSessionEscape('.')).toBe(false)
    expect(isValidSessionEscape('C:\\win')).toBe(false)
  })

  it('deriveSessionRootDir prefixes the session id; two sessions never share a root', () => {
    const a = deriveSessionRootDir('session-a')
    const b = deriveSessionRootDir('session-b')
    expect(a).toBe('sessions/session-a')
    expect(b).toBe('sessions/session-b')
    expect(a).not.toBe(b)
    // A client value nests INSIDE the owned root, never beside it.
    expect(deriveSessionRootDir('session-a', 'research')).toBe('sessions/session-a/research')
    // ...and a traversal attempt is refused, not nested.
    expect(() => deriveSessionRootDir('session-a', 'sessions/../../workspaceB/session')).toThrow(
      UnsafeRootDirError,
    )
  })

  it('sessionRootPath resolves inside the owning workspace and rejects stored traversal', () => {
    const root = '/var/lib/uni/agent'
    expect(sessionRootPath(root, 'wsA', 'sessions/s1')).toBe(`${root}/wsA/sessions/s1`)
    // A stored rootDir that somehow contains traversal fails closed.
    expect(() => sessionRootPath(root, 'wsA', 'sessions/../../wsB/s2')).toThrow(UnsafeRootDirError)
    expect(() => sessionRootPath(root, 'wsA', '/etc/passwd')).toThrow(UnsafeRootDirError)
    expect(() => sessionRootPath(root, 'wsA', '')).toThrow(UnsafeRootDirError)
  })

  it('workspaceA root cannot contain a path aimed at workspaceB (real paths)', async () => {
    const scratch = await fsp.mkdtemp(path.join(os.tmpdir(), 'uni-f01-'))
    try {
      const agentRoot = path.join(scratch, 'agent')
      const rootA = sessionRootPath(agentRoot, 'wsA', 'sessions/s1')
      const rootB = sessionRootPath(agentRoot, 'wsB', 'sessions/s1')
      await ensureSessionRoot(rootA)
      await ensureSessionRoot(rootB)
      await fsp.writeFile(path.join(rootB, 'secret.txt'), 'tenant-b-data', 'utf8')

      // Lexical traversal is dead at the contract/derive layer; verify the
      // containment check also fails closed for the literal cross-tenant
      // path (what the gate would see if anything ever resolved it).
      const escape = path.join(agentRoot, 'wsA', 'sessions', '..', '..', 'wsB', 'sessions', 's1')
      expect(isInsideDirectory(escape, rootA)).toBe(false)

      // A symlink inside rootA pointing at workspaceB's file is not
      // inside rootA either (real-path containment).
      await fsp.symlink(path.join(rootB, 'secret.txt'), path.join(rootA, 'link.txt'))
      expect(isInsideDirectory(path.join(rootA, 'link.txt'), rootA)).toBe(false)
      // ...and a dangling link fails closed too.
      await fsp.symlink(path.join(rootB, 'missing.txt'), path.join(rootA, 'dangling.txt'))
      expect(isInsideDirectory(path.join(rootA, 'dangling.txt'), rootA)).toBe(false)
    } finally {
      await fsp.rm(scratch, { recursive: true, force: true })
    }
  })

  it('ensureSessionRoot makes a fresh session usable without ENOENT', async () => {
    const scratch = await fsp.mkdtemp(path.join(os.tmpdir(), 'uni-f01-'))
    try {
      const root = sessionRootPath(path.join(scratch, 'agent'), 'wsA', 'sessions/s1')
      await ensureSessionRoot(root)
      // First write/list/read on a fresh session must succeed.
      await fsp.writeFile(path.join(root, 'note.md'), 'hello', 'utf8')
      const entries = await fsp.readdir(root)
      expect(entries).toContain('note.md')
      expect(fs.existsSync(path.join(root, 'note.md'))).toBe(true)
    } finally {
      await fsp.rm(scratch, { recursive: true, force: true })
    }
  })
})

function isValidSessionEscape(value: string): boolean {
  return isValidRootDir(value)
}
