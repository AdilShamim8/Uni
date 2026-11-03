import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { conversationNodes } from '../src/db/schema.js'
import { createDatabase } from '../src/db/client.js'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * N018 — retry-safe user-node creation. A lost node-create response
 * followed by a retry (same client operation identity / clientId) must
 * yield ONE user node. Sequential retries already replayed through the
 * in-transaction clientId lookup; the gap was the concurrent case — two
 * posts of the same clientId racing at the (conversation_id, client_id)
 * unique index made the loser's transaction abort with an unhandled
 * unique violation (raw 500).
 *
 * After the fix the loser catches the violation outside the transaction
 * and resolves with one lookup retry: the winner's committed row replays
 * as reused. No raw 500 is possible on a same-clientId race.
 */

describe('retry-safe node creation (N018)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let database: ReturnType<typeof createDatabase>
  let conversationId: string

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Node Retry' })
    database = createDatabase(testApp.databaseUrl)

    const conversationResponse = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { cookie: alice.cookie },
      payload: { title: 'Node retry test' },
    })
    expect(conversationResponse.statusCode).toBe(201)
    conversationId = (conversationResponse.json() as { id: string }).id
  }, 180_000)

  afterAll(async () => {
    if (database) await database.pool.end()
    await testApp?.app.close()
    await testApp?.stop()
  })

  async function postNode(clientId: string | undefined, content: string) {
    const response = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/nodes`,
      headers: { cookie: alice.cookie },
      payload: { role: 'user', content, status: 'complete', clientId },
    })
    return {
      status: response.statusCode,
      body: response.json() as { node?: { id?: string }; reused?: boolean; code?: string },
    }
  }

  async function countNodesForClientId(clientId: string): Promise<number> {
    const rows = await database.db
      .select({ id: conversationNodes.id })
      .from(conversationNodes)
      .where(
        and(eq(conversationNodes.conversationId, conversationId), eq(conversationNodes.clientId, clientId)),
      )
    return rows.length
  }

  it('a sequential retry after a lost response reuses the one node', async () => {
    const first = await postNode('node-retry-sequential', 'Retry me')
    expect(first.status).toBe(201)
    expect(first.body.reused).toBe(false)
    const nodeId = first.body.node!.id!

    // The client never saw the 201 (lost response) and retries the same
    // operation identity: one node, reused, identical id.
    const retry = await postNode('node-retry-sequential', 'Retry me')
    expect(retry.status).toBe(200)
    expect(retry.body.reused).toBe(true)
    expect(retry.body.node!.id).toBe(nodeId)
    expect(await countNodesForClientId('node-retry-sequential')).toBe(1)
  })

  it('concurrent same-clientId posts yield one node, no raw 500', async () => {
    const posts = await Promise.all([
      postNode('node-retry-concurrent', 'Race A'),
      postNode('node-retry-concurrent', 'Race A'),
      postNode('node-retry-concurrent', 'Race A'),
      postNode('node-retry-concurrent', 'Race A'),
      postNode('node-retry-concurrent', 'Race A'),
      postNode('node-retry-concurrent', 'Race A'),
      postNode('node-retry-concurrent', 'Race A'),
      postNode('node-retry-concurrent', 'Race A'),
    ])

    for (const post of posts) {
      expect([200, 201]).toContain(post.status)
      expect(post.body.code).toBeUndefined()
    }
    const creators = posts.filter((post) => post.status === 201)
    expect(creators.length).toBe(1)
    const reusers = posts.filter((post) => post.status === 200)
    expect(reusers.length).toBe(7)
    for (const reuser of reusers) expect(reuser.body.reused).toBe(true)

    const nodeIds = new Set(posts.map((post) => post.body.node!.id))
    expect(nodeIds.size).toBe(1)
    expect(await countNodesForClientId('node-retry-concurrent')).toBe(1)
  })

  it('different clientIds never falsely conflict', async () => {
    const [first, second] = await Promise.all([
      postNode('node-distinct-1', 'Distinct one'),
      postNode('node-distinct-2', 'Distinct two'),
    ])
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(first.body.node!.id).not.toBe(second.body.node!.id)
    expect(await countNodesForClientId('node-distinct-1')).toBe(1)
    expect(await countNodesForClientId('node-distinct-2')).toBe(1)
  })
})
