import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * T021/T022 — the two-gate plugin model end-to-end:
 * - Registry lists descriptors; workspace enablement is explicit.
 * - A grant without enablement is refused (and receipts say why).
 * - Enablement without a grant is refused likewise.
 * - Both gates open → the capability executes and receipts record ok.
 * - Revocation closes the door immediately.
 * - Receipts list per thread.
 */

describe('plugins — enablement, grants, dispatch (T021/T022)', () => {
  let testApp: TestApp
  let alice: { cookie: string }

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Plugins' })
  }, 180_000)

  afterAll(async () => {
    await testApp?.stop()
  })

  it('lists the registry with integration-required plugins marked', async () => {
    const listed = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/plugins',
      headers: { cookie: alice.cookie },
    })
    expect(listed.statusCode).toBe(200)
    const plugins = (listed.json() as { plugins: Array<{ id: string; integrationRequired: boolean }> }).plugins
    expect(plugins.map((plugin) => plugin.id)).toContain('library-context')
    expect(plugins.find((plugin) => plugin.id === 'github')!.integrationRequired).toBe(true)
    expect(plugins.find((plugin) => plugin.id === 'library-context')!.integrationRequired).toBe(false)
  }, 60_000)

  it('refuses dispatch when neither gate is open, with a precise receipt', async () => {
    const dispatched = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/plugins/dispatch',
      headers: { cookie: alice.cookie },
      payload: {
        pluginId: 'library-context',
        capability: 'library.search',
        thread: { kind: 'agent-session', threadId: 'sess-1' },
        input: { query: 'pricing' },
      },
    })
    expect(dispatched.statusCode).toBe(403)
    const body = dispatched.json() as { error: string }
    expect(body.error).toContain('not enabled')

    const receipts = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/plugins/receipts?kind=agent-session&threadId=sess-1',
      headers: { cookie: alice.cookie },
    })
    const items = (receipts.json() as { items: Array<{ status: string; detail: string }> }).items
    expect(items[0]!.status).toBe('denied')
    expect(items[0]!.detail).toContain('not enabled')
  }, 60_000)

  it('enablement without a grant is still refused', async () => {
    const enabled = await testApp.app.inject({
      method: 'PUT',
      url: '/api/v1/plugins/library-context/enabled',
      headers: { cookie: alice.cookie },
      payload: { enabled: true },
    })
    expect(enabled.statusCode).toBe(200)

    const dispatched = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/plugins/dispatch',
      headers: { cookie: alice.cookie },
      payload: {
        pluginId: 'library-context',
        capability: 'library.search',
        thread: { kind: 'agent-session', threadId: 'sess-1' },
        input: {},
      },
    })
    expect(dispatched.statusCode).toBe(403)
    expect((dispatched.json() as { error: string }).error).toContain('not granted')
  }, 60_000)

  it('both gates open → search executes over the Library and receipts say ok', async () => {
    // Seed a Library artifact to find.
    const artifact = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/library/artifacts',
      headers: { cookie: alice.cookie },
      payload: { title: 'Pricing research', kind: 'report', markdown: '# Pricing\n\nWe found the answer.' },
    })
    expect(artifact.statusCode).toBe(201)

    const granted = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/plugins/grants',
      headers: { cookie: alice.cookie },
      payload: { pluginId: 'library-context', kind: 'agent-session', threadId: 'sess-1' },
    })
    expect(granted.statusCode).toBe(201)

    const dispatched = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/plugins/dispatch',
      headers: { cookie: alice.cookie },
      payload: {
        pluginId: 'library-context',
        capability: 'library.search',
        thread: { kind: 'agent-session', threadId: 'sess-1' },
        input: { query: 'Pricing' },
      },
    })
    expect(dispatched.statusCode).toBe(200)
    const output = (dispatched.json() as {
      output: { results: Array<{ id: string; title: string }> }
      receipt: { status: string }
    }).output
    expect(output.results.some((hit) => hit.title === 'Pricing research')).toBe(true)

    const receipts = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/plugins/receipts?kind=agent-session&threadId=sess-1',
      headers: { cookie: alice.cookie },
    })
    const items = (receipts.json() as { items: Array<{ status: string }> }).items
    expect(items[0]!.status).toBe('ok')
  }, 60_000)

  it('revocation closes the door immediately', async () => {
    const revoked = await testApp.app.inject({
      method: 'DELETE',
      url: '/api/v1/plugins/grants?kind=agent-session&threadId=sess-1',
      headers: { cookie: alice.cookie },
      payload: { pluginId: 'library-context' },
    })
    expect(revoked.statusCode).toBe(204)

    const dispatched = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/plugins/dispatch',
      headers: { cookie: alice.cookie },
      payload: {
        pluginId: 'library-context',
        capability: 'library.search',
        thread: { kind: 'agent-session', threadId: 'sess-1' },
        input: { query: 'Pricing' },
      },
    })
    expect(dispatched.statusCode).toBe(403)
    expect((dispatched.json() as { error: string }).error).toContain('not granted')
  }, 60_000)

  it('data.analyze gives an honest bounded summary', async () => {
    await testApp.app.inject({
      method: 'PUT',
      url: '/api/v1/plugins/data-analysis/enabled',
      headers: { cookie: alice.cookie },
      payload: { enabled: true },
    })
    await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/plugins/grants',
      headers: { cookie: alice.cookie },
      payload: { pluginId: 'data-analysis', kind: 'work-task', threadId: 'task-1' },
    })
    const dispatched = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/plugins/dispatch',
      headers: { cookie: alice.cookie },
      payload: {
        pluginId: 'data-analysis',
        capability: 'data.analyze',
        thread: { kind: 'work-task', threadId: 'task-1' },
        input: { csv: 'name,score\nada,99\nlin,87' },
      },
    })
    expect(dispatched.statusCode).toBe(200)
    const output = (dispatched.json() as {
      output: { rows: number; columns: number; header: string[] }
    }).output
    expect(output.rows).toBe(2)
    expect(output.columns).toBe(2)
    expect(output.header).toEqual(['name', 'score'])
  }, 60_000)
})
