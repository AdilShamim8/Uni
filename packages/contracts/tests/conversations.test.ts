import { describe, expect, it } from 'vitest'
import {
  conversationDetailDtoSchema,
  conversationListQuerySchema,
  createNodeRequestSchema,
  messageNodeDtoSchema,
  nodeRoleSchema,
  nodeStatusSchema,
  patchConversationRequestSchema,
} from '../src/index.js'

/**
 * The conversation tree contract: nodes are user/assistant only,
 * client-creatable statuses never include `streaming` (that is
 * server-run execution), and patch bodies must carry at least one
 * field.
 */
describe('conversation node vocabulary', () => {
  it('roles are user/assistant only', () => {
    expect(nodeRoleSchema.safeParse('user').success).toBe(true)
    expect(nodeRoleSchema.safeParse('assistant').success).toBe(true)
    expect(nodeRoleSchema.safeParse('system').success).toBe(false)
  })

  it('client-creatable statuses exclude streaming', () => {
    expect(nodeStatusSchema.safeParse('complete').success).toBe(true)
    expect(nodeStatusSchema.safeParse('stopped').success).toBe(true)
    expect(nodeStatusSchema.safeParse('error').success).toBe(true)
    expect(nodeStatusSchema.safeParse('streaming').success).toBe(false)
  })
})

describe('message node DTO', () => {
  it('accepts a node with the optional metadata fields', () => {
    const node = {
      id: 'nd_1',
      parentId: null,
      role: 'assistant',
      status: 'complete',
      content: 'Here is the plan.',
      createdAt: 1_700_000_000_000,
      feedback: 'up',
      error: null,
      statusPrefix: null,
      tools: ['read'],
      attachments: [],
      sources: null,
    }
    expect(messageNodeDtoSchema.parse(node)).toEqual(node)
  })

  it('accepts a node with only the required fields', () => {
    expect(
      messageNodeDtoSchema.safeParse({
        id: 'nd_2',
        parentId: 'nd_1',
        role: 'user',
        status: 'complete',
        content: 'Go on.',
        createdAt: 1,
        feedback: null,
      }).success,
    ).toBe(true)
  })
})

describe('conversation list query', () => {
  it('defaults archived to exclude and limit to the page default', () => {
    expect(conversationListQuerySchema.parse({})).toEqual({ archived: 'exclude', limit: 50 })
  })

  it('accepts the three archived views and rejects others', () => {
    expect(conversationListQuerySchema.safeParse({ archived: 'include' }).success).toBe(true)
    expect(conversationListQuerySchema.safeParse({ archived: 'only' }).success).toBe(true)
    expect(conversationListQuerySchema.safeParse({ archived: 'both' }).success).toBe(false)
  })
})

describe('conversation patch + node creation', () => {
  it('a patch with no fields is rejected, not silently ignored', () => {
    const result = patchConversationRequestSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('node creation requires non-empty bounded content', () => {
    expect(createNodeRequestSchema.safeParse({ role: 'user', content: '' }).success).toBe(false)
    expect(
      createNodeRequestSchema.safeParse({ role: 'user', content: 'a'.repeat(200_001) }).success,
    ).toBe(false)
    expect(
      createNodeRequestSchema.safeParse({
        role: 'user',
        content: 'a'.repeat(200_000),
        clientId: 'client-key-1',
      }).success,
    ).toBe(true)
  })

  it('the detail DTO extends the summary with the node array', () => {
    expect(
      conversationDetailDtoSchema.safeParse({
        id: 'cv_1',
        title: 'Thread',
        agentId: null,
        pinned: false,
        archived: false,
        activeLeafId: null,
        createdAt: 1,
        updatedAt: 1,
        messageCount: 0,
        nodes: [],
      }).success,
    ).toBe(true)
  })
})
