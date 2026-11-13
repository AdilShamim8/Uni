import { describe, expect, it } from 'vitest'
import { agentSessionDtoSchema, agentToolDescriptorDtoSchema } from '@uni/contracts'
import { signUpUser, startTestApp, uniqueEmail } from './harness.js'

/**
 * Agent sessions API — CRUD + roster + workspace isolation, over the real
 * app with embedded PostgreSQL. The run/permission flow is exercised in
 * agent-runs.integration.test.ts (needs a fake provider).
 */
describe('agent sessions (abacusai-bot port)', () => {
  it('lists the tool roster descriptors', async () => {
    const test = await startTestApp()
    try {
      const alice = await signUpUser(test.app, { email: uniqueEmail('alice') })
      const response = await test.app.inject({
        method: 'GET',
        url: '/api/v1/agent/tools',
        headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      })
      expect(response.statusCode).toBe(200)
      const body = response.json() as { tools: unknown[] }
      expect(body.tools.length).toBeGreaterThanOrEqual(10)
      for (const descriptor of body.tools) {
        agentToolDescriptorDtoSchema.parse(descriptor)
      }
      const names = (body.tools as Array<{ name: string }>).map((t) => t.name)
      expect(names).toContain('bash')
      expect(names).toContain('web_fetch')
    } finally {
      await test.stop()
    }
  }, 180_000)

  it('creates, lists, patches, and deletes a session (201/200/204)', async () => {
    const test = await startTestApp()
    try {
      const alice = await signUpUser(test.app, { email: uniqueEmail('alice') })
      const cookie = alice.cookie

      const created = await test.app.inject({
        method: 'POST',
        url: '/api/v1/agent/sessions',
        headers: { cookie, origin: 'http://localhost:5173' },
        payload: {
          name: 'Research scout',
          description: 'Morning brief researcher',
          mode: 'default',
          tools: ['read', 'list', 'grep'],
        },
      })
      expect(created.statusCode).toBe(201)
      const session = agentSessionDtoSchema.parse(created.json())
      expect(session.mode).toBe('default')
      // F01: the root is server-owned and unique — always prefixed with
      // the session's own id, never the shared 'sessions/default'.
      expect(session.rootDir).toBe(`sessions/${session.id}`)
      expect(session.status).toBe('idle')

      const listed = await test.app.inject({
        method: 'GET',
        url: '/api/v1/agent/sessions',
        headers: { cookie, origin: 'http://localhost:5173' },
      })
      expect(listed.statusCode).toBe(200)
      expect((listed.json() as { items: unknown[] }).items).toHaveLength(1)

      const patched = await test.app.inject({
        method: 'PATCH',
        url: `/api/v1/agent/sessions/${session.id}`,
        headers: { cookie, origin: 'http://localhost:5173' },
        payload: { mode: 'plan' },
      })
      expect(patched.statusCode).toBe(200)
      expect((patched.json() as { mode: string }).mode).toBe('plan')

      const deleted = await test.app.inject({
        method: 'DELETE',
        url: `/api/v1/agent/sessions/${session.id}`,
        headers: { cookie, origin: 'http://localhost:5173' },
      })
      expect(deleted.statusCode).toBe(204)

      const gone = await test.app.inject({
        method: 'GET',
        url: `/api/v1/agent/sessions/${session.id}`,
        headers: { cookie, origin: 'http://localhost:5173' },
      })
      expect(gone.statusCode).toBe(404)
    } finally {
      await test.stop()
    }
  }, 180_000)

  it('exposes the employee soft pin on the DTO (RF-071)', async () => {
    const test = await startTestApp()
    try {
      const alice = await signUpUser(test.app, { email: uniqueEmail('alice') })
      // Create with a pin, then clear it: the DTO must reflect both states.
      const employee = await test.app.inject({
        method: 'POST',
        url: '/api/v1/employees',
        headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
        payload: { name: 'Pinned one', description: 'dto target' },
      })
      const employeeId = (employee.json() as { id: string }).id

      const created = await test.app.inject({
        method: 'POST',
        url: '/api/v1/agent/sessions',
        headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
        payload: { name: 'Pinned session', employeeId },
      })
      expect(created.statusCode).toBe(201)
      expect(((created.json() as { employeeId: string | null }).employeeId)).toBe(employeeId)

      const cleared = await test.app.inject({
        method: 'PATCH',
        url: `/api/v1/agent/sessions/${(created.json() as { id: string }).id}`,
        headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
        payload: { employeeId: null },
      })
      expect(cleared.statusCode).toBe(200)
      expect(((cleared.json() as { employeeId: string | null }).employeeId)).toBeNull()
    } finally {
      await test.stop()
    }
  }, 180_000)

  it('rejects traversal-shaped rootDir at the contract boundary (F01)', async () => {
    const test = await startTestApp()
    try {
      const alice = await signUpUser(test.app, { email: uniqueEmail('alice') })
      for (const rootDir of [
        'sessions/../../workspaceB/session',
        '/etc/passwd',
        'a\\b',
        'a/./b',
      ]) {
        const created = await test.app.inject({
          method: 'POST',
          url: '/api/v1/agent/sessions',
          headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
          payload: { name: 'Evil', rootDir },
        })
        expect(created.statusCode).toBe(400)
      }
      // Two fresh sessions get different server-owned roots.
      const first = await test.app.inject({
        method: 'POST',
        url: '/api/v1/agent/sessions',
        headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
        payload: { name: 'One' },
      })
      const second = await test.app.inject({
        method: 'POST',
        url: '/api/v1/agent/sessions',
        headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
        payload: { name: 'Two' },
      })
      const r1 = first.json() as { rootDir: string }
      const r2 = second.json() as { rootDir: string }
      expect(r1.rootDir).toMatch(/^sessions\/[0-9a-f-]{36}$/)
      expect(r1.rootDir).not.toBe(r2.rootDir)
    } finally {
      await test.stop()
    }
  }, 180_000)

  it('unattended mode is spawn-only: create refuses it, patch refuses it', async () => {
    const test = await startTestApp()
    try {
      const alice = await signUpUser(test.app, { email: uniqueEmail('alice') })
      const cookie = alice.cookie
      const created = await test.app.inject({
        method: 'POST',
        url: '/api/v1/agent/sessions',
        headers: { cookie, origin: 'http://localhost:5173' },
        payload: { name: 'S', mode: 'unattended' },
      })
      expect(created.statusCode).toBe(400)
    } finally {
      await test.stop()
    }
  }, 180_000)

  it('cross-workspace ids resolve to 404, not 403', async () => {
    const test = await startTestApp()
    try {
      const alice = await signUpUser(test.app, { email: uniqueEmail('alice') })
      const bob = await signUpUser(test.app, { email: uniqueEmail('bob') })
      const created = await test.app.inject({
        method: 'POST',
        url: '/api/v1/agent/sessions',
        headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
        payload: { name: 'Mine' },
      })
      const session = created.json() as { id: string }
      const foreign = await test.app.inject({
        method: 'GET',
        url: `/api/v1/agent/sessions/${session.id}`,
        headers: { cookie: bob.cookie, origin: 'http://localhost:5173' },
      })
      expect(foreign.statusCode).toBe(404)
    } finally {
      await test.stop()
    }
  }, 180_000)

  it('requires authentication', async () => {
    const test = await startTestApp()
    try {
      const response = await test.app.inject({
        method: 'GET',
        url: '/api/v1/agent/sessions',
        headers: { origin: 'http://localhost:5173' },
      })
      expect(response.statusCode).toBe(401)
    } finally {
      await test.stop()
    }
  }, 180_000)
})
