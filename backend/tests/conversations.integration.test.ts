import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { count, eq } from 'drizzle-orm'
import {
  conversationDetailDtoSchema,
  conversationSummaryDtoSchema,
  errorEnvelopeSchema,
  pageSchema,
} from '@uni/contracts'
import { conversationNodes } from '../src/db/schema.js'
import { createDatabase } from '../src/db/client.js'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * B02 slice 2 — conversation CRUD and message-tree persistence. The
 * critical security property: two users cannot read or change each
 * other's conversations, including guessed IDs.
 */
describe('conversations — CRUD, tree, isolation', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let bob: { cookie: string }

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice' })
    bob = await signUpUser(testApp.app, { name: 'Bob' })
  }, 180_000)

  afterAll(async () => {
    await testApp?.stop()
  })

  async function createConversation(cookie: string, title: string) {
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { cookie },
      payload: { title },
    })
    expect(response.statusCode).toBe(201)
    return conversationSummaryDtoSchema.parse(response.json())
  }

  async function createNode(
    cookie: string,
    conversationId: string,
    payload: Record<string, unknown>,
  ) {
    const response = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/nodes`,
      headers: { cookie },
      payload,
    })
    return response
  }

  it('creates conversations, lists them paginated with cursors', async () => {
    const { app } = testApp
    for (let index = 0; index < 5; index += 1) {
      await createConversation(alice.cookie, `Chat ${index}`)
    }

    // Bob sees none of Alice's conversations.
    const bobList = await app.inject({ method: 'GET', url: '/api/v1/conversations', headers: { cookie: bob.cookie } })
    expect(bobList.statusCode).toBe(200)
    const bobPage = pageSchema.parse(bobList.json())
    expect(bobPage.items).toHaveLength(0)
    expect(bobPage.nextCursor).toBeNull()

    // Alice pages through with limit 2.
    const seen: string[] = []
    let cursor: string | null = null
    do {
      const url = cursor
        ? `/api/v1/conversations?limit=2&cursor=${encodeURIComponent(cursor)}`
        : '/api/v1/conversations?limit=2'
      const response = await app.inject({ method: 'GET', url, headers: { cookie: alice.cookie } })
      expect(response.statusCode).toBe(200)
      const page = pageSchema.parse(response.json()) as { items: Array<{ id: string }>; nextCursor: string | null }
      seen.push(...page.items.map((item) => item.id))
      cursor = page.nextCursor
    } while (cursor !== null)
    expect(seen).toHaveLength(5)
    expect(new Set(seen).size).toBe(5)
  })

  it('persists a message tree with siblings and switches the active branch', async () => {
    const { app } = testApp
    const conversation = await createConversation(alice.cookie, 'Tree chat')

    // Root user message.
    const root = await createNode(alice.cookie, conversation.id, {
      role: 'user',
      content: 'What is the capital of France?',
      clientId: 'root-1',
    })
    expect(root.statusCode).toBe(201)
    const rootNode = (root.json() as { node: { id: string } }).node

    // First assistant answer.
    const answerA = await createNode(alice.cookie, conversation.id, {
      parentId: rootNode.id,
      role: 'assistant',
      content: 'Paris.',
    })
    expect(answerA.statusCode).toBe(201)

    // Regenerate: a SIBLING under the same parent.
    const answerB = await createNode(alice.cookie, conversation.id, {
      parentId: rootNode.id,
      role: 'assistant',
      content: 'The capital is Paris.',
    })
    expect(answerB.statusCode).toBe(201)
    const answerBNode = (answerB.json() as { node: { id: string } }).node

    // The newest branch is active after creation.
    const afterB = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${conversation.id}`,
      headers: { cookie: alice.cookie },
    })
    const detailB = conversationDetailDtoSchema.parse(afterB.json())
    expect(detailB.nodes).toHaveLength(3)
    expect(detailB.activeLeafId).toBe(answerBNode.id)

    // Editing the user message creates another sibling branch; selecting
    // the older branch via PATCH switches the active leaf back.
    const detailAId = (answerA.json() as { node: { id: string } }).node.id
    const switched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/conversations/${conversation.id}`,
      headers: { cookie: alice.cookie },
      payload: { activeLeafId: detailAId },
    })
    expect(switched.statusCode).toBe(200)
    const switchedDetail = conversationDetailDtoSchema.parse(switched.json())
    expect(switchedDetail.activeLeafId).toBe(detailAId)
    expect(switchedDetail.nodes).toHaveLength(3)
  })

  it('lists the real message count per conversation (correlated subquery regression)', async () => {
    const { app } = testApp
    const conversation = await createConversation(alice.cookie, 'Counted chat')
    await createNode(alice.cookie, conversation.id, {
      role: 'user',
      content: 'One',
      clientId: 'count-1',
    })
    await createNode(alice.cookie, conversation.id, {
      role: 'assistant',
      content: 'Two',
      clientId: 'count-2',
    })
    await createNode(alice.cookie, conversation.id, {
      role: 'user',
      content: 'Three',
      clientId: 'count-3',
    })

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations',
      headers: { cookie: alice.cookie },
    })
    expect(list.statusCode).toBe(200)
    const items = (list.json() as { items: Array<{ id: string; messageCount: number }> }).items
    const counted = items.find((item) => item.id === conversation.id)
    // The correlated subquery must count THIS conversation's nodes —
    // the pre-fix SQL compared node.id to node.conversation_id (always
    // false) and reported 0 for every conversation.
    expect(counted?.messageCount).toBe(3)
  })

  it('blocks another user from reading, changing, or deleting conversations (guessed IDs)', async () => {
    const { app } = testApp
    const conversation = await createConversation(alice.cookie, 'Alice private')
    await createNode(alice.cookie, conversation.id, {
      role: 'user',
      content: 'secret alice content',
    })

    const bobGet = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${conversation.id}`,
      headers: { cookie: bob.cookie },
    })
    expect(bobGet.statusCode).toBe(404)
    expect(bobGet.body).not.toContain('Alice private')
    expect(bobGet.body).not.toContain('secret alice content')

    const bobPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/conversations/${conversation.id}`,
      headers: { cookie: bob.cookie },
      payload: { title: 'hijacked' },
    })
    expect(bobPatch.statusCode).toBe(404)

    const bobNode = await createNode(bob.cookie, conversation.id, {
      role: 'user',
      content: 'injected',
    })
    expect([404, 400]).toContain(bobNode.statusCode)

    const bobDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/conversations/${conversation.id}`,
      headers: { cookie: bob.cookie },
    })
    expect(bobDelete.statusCode).toBe(404)

    // Alice's data is untouched.
    const aliceGet = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${conversation.id}`,
      headers: { cookie: alice.cookie },
    })
    expect(aliceGet.statusCode).toBe(200)
    const detail = conversationDetailDtoSchema.parse(aliceGet.json())
    expect(detail.title).toBe('Alice private')
    expect(detail.nodes).toHaveLength(1)
  })

  it('rejects cross-conversation parents and foreign activeLeafIds', async () => {
    const { app } = testApp
    const first = await createConversation(alice.cookie, 'First')
    const second = await createConversation(alice.cookie, 'Second')

    const root = await createNode(alice.cookie, first.id, {
      role: 'user',
      content: 'root of first',
    })
    const rootId = (root.json() as { node: { id: string } }).node.id

    // A node in `second` cannot parent onto a node of `first`.
    const crossParent = await createNode(alice.cookie, second.id, {
      parentId: rootId,
      role: 'assistant',
      content: 'cross-conversation child',
    })
    expect(crossParent.statusCode).toBe(400)
    const crossEnvelope = errorEnvelopeSchema.parse(crossParent.json())
    expect(crossEnvelope.code).toBe('validation_error')

    // activeLeafId must reference a node of the SAME conversation.
    const badLeaf = await app.inject({
      method: 'PATCH',
      url: `/api/v1/conversations/${second.id}`,
      headers: { cookie: alice.cookie },
      payload: { activeLeafId: rootId },
    })
    expect(badLeaf.statusCode).toBe(400)
  })

  it('rejects optimistic-concurrency overwrites with a conflict and recovery info', async () => {
    const { app } = testApp
    const conversation = await createConversation(alice.cookie, 'Concurrent edit')

    const first = await app.inject({
      method: 'PATCH',
      url: `/api/v1/conversations/${conversation.id}`,
      headers: { cookie: alice.cookie },
      payload: { title: 'First writer wins' },
    })
    expect(first.statusCode).toBe(200)
    const firstUpdatedAt = (first.json() as { updatedAt: number }).updatedAt

    // A stale editor (holding the pre-update timestamp) must get 409.
    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/v1/conversations/${conversation.id}`,
      headers: { cookie: alice.cookie },
      payload: { title: 'Stale writer', expectedUpdatedAt: firstUpdatedAt - 5_000 },
    })
    expect(stale.statusCode).toBe(409)
    const staleEnvelope = errorEnvelopeSchema.parse(stale.json())
    expect(staleEnvelope.code).toBe('conflict')

    // Matching expectation succeeds.
    const fresh = await app.inject({
      method: 'PATCH',
      url: `/api/v1/conversations/${conversation.id}`,
      headers: { cookie: alice.cookie },
      payload: { title: 'Fresh writer', expectedUpdatedAt: firstUpdatedAt },
    })
    expect(fresh.statusCode).toBe(200)
  })

  it('deduplicates repeated node creation via the clientId idempotency key', async () => {
    const { app } = testApp
    const conversation = await createConversation(alice.cookie, 'Idempotent')

    const first = await createNode(alice.cookie, conversation.id, {
      role: 'user',
      content: 'send only once',
      clientId: 'node-key-1',
    })
    expect(first.statusCode).toBe(201)
    const firstNode = (first.json() as { node: { id: string } }).node

    // Duplicate POST with the same clientId reuses the stored node.
    const repeat = await createNode(alice.cookie, conversation.id, {
      role: 'user',
      content: 'send only once',
      clientId: 'node-key-1',
    })
    expect(repeat.statusCode).toBe(200)
    const repeatNode = (repeat.json() as { node: { id: string } }).node
    expect(repeatNode.id).toBe(firstNode.id)

    const database = createDatabase(testApp.databaseUrl)
    try {
      const rows = await database.db
        .select({ total: count() })
        .from(conversationNodes)
        .where(eq(conversationNodes.conversationId, conversation.id))
      expect(rows[0]?.total).toBe(1)
    } finally {
      await database.pool.end()
    }
  })

  it('deleting a conversation cascades its nodes', async () => {
    const { app } = testApp
    const conversation = await createConversation(alice.cookie, 'To delete')
    const root = await createNode(alice.cookie, conversation.id, { role: 'user', content: 'x' })
    const rootId = (root.json() as { node: { id: string } }).node.id
    await createNode(alice.cookie, conversation.id, {
      parentId: rootId,
      role: 'assistant',
      content: 'y',
    })

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/conversations/${conversation.id}`,
      headers: { cookie: alice.cookie },
    })
    expect(removed.statusCode).toBe(204)

    const gone = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${conversation.id}`,
      headers: { cookie: alice.cookie },
    })
    expect(gone.statusCode).toBe(404)

    const database = createDatabase(testApp.databaseUrl)
    try {
      const rows = await database.db
        .select({ total: count() })
        .from(conversationNodes)
        .where(eq(conversationNodes.conversationId, conversation.id))
      expect(rows[0]?.total).toBe(0)
    } finally {
      await database.pool.end()
    }
  })
})
