import { describe, expect, it } from 'vitest'
import {
  createPluginGrantRequestSchema,
  pluginDescriptorSchema,
  pluginGrantKindSchema,
  pluginRunReceiptDtoSchema,
} from '../src/index.js'

/**
 * Two gates: workspace enablement vs per-thread grants. A run may use
 * a plugin only when both hold; receipts record what actually happened.
 */
describe('plugin grant vocabulary', () => {
  it('grants target one of the three thread kinds', () => {
    expect(pluginGrantKindSchema.safeParse('conversation').success).toBe(true)
    expect(pluginGrantKindSchema.safeParse('agent-session').success).toBe(true)
    expect(pluginGrantKindSchema.safeParse('work-task').success).toBe(true)
    expect(pluginGrantKindSchema.safeParse('workspace').success).toBe(false)
  })

  it('a grant request trims and requires its fields', () => {
    expect(
      createPluginGrantRequestSchema.safeParse({
        pluginId: 'web_search',
        kind: 'conversation',
        threadId: 'cv_1',
      }).success,
    ).toBe(true)
    expect(
      createPluginGrantRequestSchema.safeParse({
        pluginId: '  ',
        kind: 'conversation',
        threadId: 'cv_1',
      }).success,
    ).toBe(false)
  })
})

describe('plugin descriptor + receipts', () => {
  it('the registry entry is bounded static metadata', () => {
    const descriptor = {
      id: 'web_search',
      name: 'Web Search',
      description: 'Search the public web.',
      capabilities: ['search'],
      integrationRequired: true,
    }
    expect(pluginDescriptorSchema.parse(descriptor)).toEqual(descriptor)
  })

  it('receipt statuses are the honest ok/error/denied set', () => {
    const receipt = {
      id: 'rc_1',
      workspaceId: 'ws_1',
      pluginId: 'web_search',
      capability: 'search',
      kind: 'conversation',
      threadId: 'cv_1',
      runId: null,
      status: 'denied',
      detail: 'No grant for this thread.',
      createdAt: 1,
    }
    expect(pluginRunReceiptDtoSchema.parse(receipt)).toEqual(receipt)
    expect(pluginRunReceiptDtoSchema.safeParse({ ...receipt, status: 'skipped' }).success).toBe(false)
  })
})
