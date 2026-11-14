import { describe, expect, it } from 'vitest'
import * as contracts from '../src/index.js'

/**
 * The public surface guard: the barrel re-exports every module's
 * contract. A schema renamed away or silently dropped from index.ts
 * breaks both sides at once — this fails first, with the name.
 */
describe('public surface re-exports', () => {
  it('API constants', () => {
    expect(contracts.API_VERSION).toBe('v1')
    expect(contracts.API_ROOT).toBe('/api/v1')
  })

  it('error + health + pagination + me', () => {
    expect(contracts.errorEnvelopeSchema).toBeDefined()
    expect(contracts.ERROR_CODES).toBeDefined()
    expect(contracts.healthLiveSchema).toBeDefined()
    expect(contracts.healthReadySchema).toBeDefined()
    expect(contracts.pageQuerySchema).toBeDefined()
    expect(contracts.pageSchema).toBeDefined()
    expect(contracts.meResponseSchema).toBeDefined()
  })

  it('conversations + backup + providers', () => {
    expect(contracts.messageNodeDtoSchema).toBeDefined()
    expect(contracts.conversationDetailDtoSchema).toBeDefined()
    expect(contracts.workspaceBackupSchema).toBeDefined()
    expect(contracts.BACKUP_KIND).toBe('uni-workspace-backup')
    expect(contracts.providerDtoSchema).toBeDefined()
    expect(contracts.providerTestResponseSchema).toBeDefined()
    expect(contracts.PROVIDER_DESCRIPTORS).toBeDefined()
  })

  it('runs + employees + memory + library', () => {
    expect(contracts.runDtoSchema).toBeDefined()
    expect(contracts.runEventSchema).toBeDefined()
    expect(contracts.employeeDtoSchema).toBeDefined()
    expect(contracts.memoryNoteDtoSchema).toBeDefined()
    expect(contracts.memoryJournalEntryDtoSchema).toBeDefined()
    expect(contracts.libraryArtifactDtoSchema).toBeDefined()
    expect(contracts.canonicalSaveResultSchema).toBeDefined()
  })

  it('agents + tools + connectors + work + routines', () => {
    expect(contracts.agentSessionDtoSchema).toBeDefined()
    expect(contracts.agentModeSchema).toBeDefined()
    expect(contracts.agentToolNameSchema).toBeDefined()
    expect(contracts.AGENT_TOOL_DESCRIPTORS).toBeDefined()
    expect(contracts.connectorDtoSchema).toBeDefined()
    expect(contracts.connectorTestResultDtoSchema).toBeDefined()
    expect(contracts.workTaskDtoSchema).toBeDefined()
    expect(contracts.workRunReceiptsSchema).toBeDefined()
    expect(contracts.routineDtoSchema).toBeDefined()
    expect(contracts.routineRunDtoSchema).toBeDefined()
  })

  it('files + workspace + plugins + mcp', () => {
    expect(contracts.fileDocumentDtoSchema).toBeDefined()
    expect(contracts.retrievalRequestSchema).toBeDefined()
    expect(contracts.workspaceExportDtoSchema).toBeDefined()
    expect(contracts.pluginGrantDtoSchema).toBeDefined()
    expect(contracts.pluginRunReceiptDtoSchema).toBeDefined()
    expect(contracts.mcpServerDtoSchema).toBeDefined()
    expect(contracts.mcpToolDtoSchema).toBeDefined()
  })
})
