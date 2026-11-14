import { describe, expect, it } from 'vitest'
import {
  createMcpServerRequestSchema,
  mcpAuthConfigSchema,
  mcpServerDtoSchema,
  mcpServerStatusSchema,
  mcpToolDtoSchema,
  patchMcpServerRequestSchema,
} from '../src/index.js'

/**
 * MCP servers: remote HTTP tool providers. Auth material is stored
 * encrypted and NEVER appears in a DTO — only `authConfigured` does.
 */
describe('MCP vocabulary', () => {
  it('server statuses are honest: disconnected until proven, then connected or error', () => {
    for (const status of ['disconnected', 'connected', 'error']) {
      expect(mcpServerStatusSchema.safeParse(status).success).toBe(true)
    }
    expect(mcpServerStatusSchema.safeParse('connecting').success).toBe(false)
  })
})

describe('MCP auth config', () => {
  it('none carries nothing; bearer carries a bounded token', () => {
    expect(mcpAuthConfigSchema.safeParse({ type: 'none' }).success).toBe(true)
    expect(mcpAuthConfigSchema.safeParse({ type: 'bearer', token: 'tok' }).success).toBe(true)
    expect(mcpAuthConfigSchema.safeParse({ type: 'bearer' }).success).toBe(false)
    expect(mcpAuthConfigSchema.safeParse({ type: 'bearer', token: '' }).success).toBe(false)
  })
})

describe('MCP server DTO + requests', () => {
  const dto = {
    id: 'mcp_1',
    name: 'Company tools',
    url: 'https://mcp.example.test/sse',
    status: 'connected',
    authConfigured: true,
    authType: 'bearer',
    lastError: null,
    serverInfo: { name: 'company-tools', version: '1.2.0' },
    createdAt: 1,
    updatedAt: 1,
  }

  it('the DTO exposes presence, never the token', () => {
    expect(mcpServerDtoSchema.parse(dto)).toEqual(dto)
    expect(Object.keys(mcpServerDtoSchema.shape)).not.toContain('token')
  })

  it('creation requires a real URL and trims the name', () => {
    expect(
      createMcpServerRequestSchema.safeParse({ name: '  Tools  ', url: 'https://mcp.test' })
        .success,
    ).toBe(true)
    expect(
      createMcpServerRequestSchema.safeParse({ name: 'Tools', url: 'not-a-url' }).success,
    ).toBe(false)
  })

  it('a patch with no fields is rejected', () => {
    expect(patchMcpServerRequestSchema.safeParse({}).success).toBe(false)
    expect(patchMcpServerRequestSchema.safeParse({ name: 'Renamed' }).success).toBe(true)
  })
})

describe('MCP tool DTO', () => {
  it('carries the namespaced name and the untrusted read-only hint', () => {
    const tool = {
      name: 'list_prs',
      description: 'List pull requests',
      namespacedName: 'github__list_prs',
      readOnlyHint: true,
    }
    expect(mcpToolDtoSchema.parse(tool)).toEqual(tool)
    expect(mcpToolDtoSchema.safeParse({ ...tool, readOnlyHint: null }).success).toBe(true)
    expect(mcpToolDtoSchema.safeParse({ ...tool, namespacedName: '' }).success).toBe(false)
  })
})
