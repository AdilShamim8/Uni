import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { count, eq } from 'drizzle-orm'
import {
  importCommitResponseSchema,
  importPreviewResponseSchema,
  errorEnvelopeSchema,
} from '@uni/contracts'
import { conversations as conversationsTable } from '../src/db/schema.js'
import { createDatabase } from '../src/db/client.js'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * B02 slice 3 — deliberate, idempotent import of the local workspace
 * backup: dry-run preview, explicit commit, replay without duplicates,
 * honest reporting of unsupported sections, no temporary chats.
 */

function backupOf(options: {
  conversations?: Array<Record<string, unknown>>
  extraPayload?: Record<string, unknown>
} = {}) {
  return {
    kind: 'uni-workspace-backup',
    version: 1,
    savedAt: 1_700_000_000_000,
    payload: {
      app: {
        version: 1,
        savedAt: 1_700_000_000_000,
        conversations:
          options.conversations ??
          [
            {
              id: 'local-conv-1',
              title: 'Imported chat',
              createdAt: 1_700_000_000_000,
              updatedAt: 1_700_000_010_000,
              pinned: true,
              archived: false,
              nodes: {
                'local-node-a': {
                  id: 'local-node-a',
                  parentId: null,
                  role: 'user',
                  content: 'Hello from the old machine',
                  createdAt: 1_700_000_001_000,
                  status: 'complete',
                },
                'local-node-b': {
                  id: 'local-node-b',
                  parentId: 'local-node-a',
                  role: 'assistant',
                  content: 'Welcome back!',
                  createdAt: 1_700_000_002_000,
                  status: 'complete',
                },
                // A sibling branch (regenerated answer) under the same parent.
                'local-node-c': {
                  id: 'local-node-c',
                  parentId: 'local-node-a',
                  role: 'assistant',
                  content: 'Welcome back, again!',
                  createdAt: 1_700_000_003_000,
                  status: 'stopped',
                },
              },
              activeLeafId: 'local-node-c',
            },
          ],
        preferences: {},
        providers: [],
        activeProviderId: null,
        activeModelId: null,
      },
      agents: { agents: [], memoryNotes: [] },
      work: { tasks: [] },
      library: { artifacts: [], projects: [] },
      context: { version: 1 },
      plugins: { enabled: [] },
      ...options.extraPayload,
    },
  }
}

describe('importer — preview, commit, idempotency', () => {
  let testApp: TestApp
  let alice: { cookie: string }

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Importer' })
  }, 180_000)

  afterAll(async () => {
    await testApp.stop()
  })

  it('previews counts, unsupported sections, and errors without storing anything', async () => {
    const { app } = testApp
    const backup = backupOf()

    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      headers: { cookie: alice.cookie },
      payload: backup,
    })
    expect(preview.statusCode).toBe(200)
    const body = importPreviewResponseSchema.parse(preview.json())
    expect(body.counts.conversations).toBe(1)
    expect(body.counts.messages).toBe(3)
    expect(body.counts.skippedTemporary).toBe(0)
    expect(body.errors).toHaveLength(0)
    expect(body.unsupported).toContain('agents')
    expect(body.unsupported).toContain('work')
    expect(body.unsupported).toContain('library')
    expect(body.checksum).toHaveLength(64)

    // Preview stored nothing.
    const database = createDatabase(testApp.databaseUrl)
    try {
      const rows = await database.db.select({ total: count() }).from(conversationsTable)
      expect(rows[0]?.total).toBe(0)
    } finally {
      await database.pool.end()
    }
  })

  it('commits once; re-importing the same backup replays without duplicates', async () => {
    const { app } = testApp
    const backup = backupOf()

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/import/commit',
      headers: { cookie: alice.cookie },
      payload: backup,
    })
    expect(first.statusCode).toBe(200)
    const firstBody = importCommitResponseSchema.parse(first.json())
    expect(firstBody.idempotentReplay).toBe(false)
    expect(firstBody.imported.conversations).toBe(1)
    expect(firstBody.imported.messages).toBe(3)
    expect(firstBody.conversationIdMap['local-conv-1']).toBeTruthy()

    const serverConversationId = firstBody.conversationIdMap['local-conv-1']!

    // The imported tree is retrievable with branches and the active leaf.
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${serverConversationId}`,
      headers: { cookie: alice.cookie },
    })
    expect(detail.statusCode).toBe(200)
    const detailBody = detail.json() as {
      nodes: Array<{ id: string; parentId: string | null; status: string }>
      activeLeafId: string
      title: string
      pinned: boolean
    }
    expect(detailBody.nodes).toHaveLength(3)
    expect(detailBody.title).toBe('Imported chat')
    expect(detailBody.pinned).toBe(true)
    const roots = detailBody.nodes.filter((node) => node.parentId === null)
    expect(roots).toHaveLength(1)
    // The active branch is the regenerated sibling.
    const activeNode = detailBody.nodes.find((node) => node.id === detailBody.activeLeafId)
    expect(activeNode?.status).toBe('stopped')

    // Second commit of the identical backup: replay, no duplicates.
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/import/commit',
      headers: { cookie: alice.cookie },
      payload: backup,
    })
    expect(second.statusCode).toBe(200)
    const secondBody = importCommitResponseSchema.parse(second.json())
    expect(secondBody.idempotentReplay).toBe(true)
    expect(secondBody.batchId).toBe(firstBody.batchId)
    expect(secondBody.imported.conversations).toBe(1)
    expect(secondBody.conversationIdMap['local-conv-1']).toBe(serverConversationId)
  })

  it('keeps exactly one copy after double import (no duplicated rows)', async () => {
    const database = createDatabase(testApp.databaseUrl)
    try {
      const rows = await database.db.select({ total: count() }).from(conversationsTable)
      expect(rows[0]?.total).toBe(1)
    } finally {
      await database.pool.end()
    }
  })

  it('defensively skips temporary conversations even if present in a crafted backup', async () => {
    const { app } = testApp
    const backup = backupOf({
      conversations: [
        {
          id: 'local-temp',
          title: 'Temporary chat',
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
          temporary: true,
          nodes: {},
          activeLeafId: null,
        },
      ],
    })

    const commit = await app.inject({
      method: 'POST',
      url: '/api/v1/import/commit',
      headers: { cookie: alice.cookie },
      payload: backup,
    })
    expect(commit.statusCode).toBe(200)
    const body = importCommitResponseSchema.parse(commit.json())
    expect(body.imported.conversations).toBe(0)
    expect(body.skippedTemporary).toBe(1)

    // And the temporary conversation is not retrievable anywhere.
    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations?archived=include',
      headers: { cookie: alice.cookie },
    })
    const page = list.json() as { items: Array<{ id: string }> }
    expect(page.items.every((item) => item.id !== 'local-temp')).toBe(true)
  })

  it('rejects structurally invalid backups with 400 and stores nothing', async () => {
    const { app } = testApp
    const database = createDatabase(testApp.databaseUrl)
    let before = 0
    try {
      const rows = await database.db.select({ total: count() }).from(conversationsTable)
      before = rows[0]?.total ?? 0
    } finally {
      await database.pool.end()
    }

    // Node references a parent that does not exist.
    const broken = backupOf({
      conversations: [
        {
          id: 'broken-1',
          title: 'Broken',
          createdAt: 1,
          updatedAt: 2,
          nodes: {
            orphan: {
              id: 'orphan',
              parentId: 'does-not-exist',
              role: 'assistant',
              content: 'x',
              createdAt: 3,
              status: 'complete',
            },
          },
          activeLeafId: 'orphan',
        },
      ],
    })
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/v1/import/commit',
      headers: { cookie: alice.cookie },
      payload: broken,
    })
    expect(rejected.statusCode).toBe(400)
    const envelope = errorEnvelopeSchema.parse(rejected.json())
    expect(envelope.code).toBe('validation_error')

    // Not even a valid-looking but wrong-kind payload passes.
    const wrongKind = await app.inject({
      method: 'POST',
      url: '/api/v1/import/preview',
      headers: { cookie: alice.cookie },
      payload: { kind: 'something-else', version: 1 },
    })
    expect(wrongKind.statusCode).toBe(400)

    const after = createDatabase(testApp.databaseUrl)
    try {
      const rows = await after.db.select({ total: count() }).from(conversationsTable)
      expect(rows[0]?.total).toBe(before)
    } finally {
      await after.pool.end()
    }
  })

  it('imports land in the caller workspace only (second user sees none)', async () => {
    const { app } = testApp
    const bob = await signUpUser(app, { name: 'Bob Import' })

    const bobList = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations?archived=include',
      headers: { cookie: bob.cookie },
    })
    const page = bobList.json() as { items: unknown[] }
    expect(page.items).toHaveLength(0)
  })
})
