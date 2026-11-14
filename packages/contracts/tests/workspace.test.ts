import { describe, expect, it } from 'vitest'
import { workspaceExportDtoSchema } from '../src/index.js'

/**
 * The workspace export contract — the exact shape the import path and
 * the backup UI rely on. A section added to the export without its
 * contract entry (the RF-112 drift class) must fail HERE first.
 */
const completeExport = {
  format: 'uni.workspace.export/1',
  exportedAt: 1_700_000_000_000,
  employees: [
    {
      id: 'emp_1',
      name: 'Researcher',
      description: 'Finds sources.',
      instructions: 'Be terse.',
      category: 'specialist',
      providerId: null,
      modelId: null,
      tools: [],
      starters: [],
      archived: false,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  memoryNotes: [
    { id: 'note_1', employeeId: 'emp_1', text: 'Prefers bullets.', createdAt: 1, updatedAt: 1 },
  ],
  memoryJournal: [
    {
      id: 'j_1',
      employeeId: 'emp_1',
      noteId: 'note_1',
      actor: 'user',
      via: 'api',
      kind: 'created',
      diff: '+Prefers bullets.',
      added: 1,
      removed: 0,
      canRevert: false,
      revertUnavailableReason: 'The note is gone.',
      createdAt: 1,
    },
  ],
  routines: [
    {
      id: 'rt_1',
      sessionId: 'sess_1',
      employeeId: null,
      name: 'Morning brief',
      prompt: 'Summarize.',
      schedule: '30 9 * * 1-5',
      catchUpMinutes: 0,
      paused: false,
      archived: false,
      lastFireAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  routineRuns: [
    {
      id: 'rr_1',
      routineId: 'rt_1',
      scheduledFor: 1,
      status: 'skipped',
      agentRunId: null,
      outputText: '',
      errorCode: null,
      errorMessage: null,
      terminalAt: 1,
      createdAt: 1,
    },
  ],
  files: [
    {
      id: 'doc_1',
      title: 'Brief',
      fileName: 'brief.md',
      extension: 'md',
      mimeType: 'text/markdown',
      extraction: 'extracted',
      extractedText: 'Ship the export endpoint.',
      charCount: 25,
      createdAt: 1,
    },
  ],
  counts: {
    employees: 1,
    memoryNotes: 1,
    memoryJournal: 1,
    routines: 1,
    routineRuns: 1,
    files: 1,
  },
}

describe('workspace export contract', () => {
  it('accepts a complete export with all six sections', () => {
    expect(workspaceExportDtoSchema.parse(completeExport)).toEqual(completeExport)
  })

  it('the format literal is versioned — any other value is rejected', () => {
    expect(
      workspaceExportDtoSchema.safeParse({ ...completeExport, format: 'uni.workspace.export/2' })
        .success,
    ).toBe(false)
  })

  it('every section is required — dropping one is a contract break', () => {
    for (const section of [
      'employees',
      'memoryNotes',
      'memoryJournal',
      'routines',
      'routineRuns',
      'files',
    ]) {
      const broken = { ...completeExport } as Record<string, unknown>
      delete broken[section]
      expect(workspaceExportDtoSchema.safeParse(broken).success).toBe(false)
    }
  })

  it('the counts block carries one nonnegative counter per section', () => {
    for (const key of [
      'employees',
      'memoryNotes',
      'memoryJournal',
      'routines',
      'routineRuns',
      'files',
    ]) {
      const broken = {
        ...completeExport,
        counts: { ...completeExport.counts, [key]: -1 },
      }
      expect(workspaceExportDtoSchema.safeParse(broken).success).toBe(false)
    }
  })

  it('empty sections are valid — an empty workspace exports honestly', () => {
    const empty = {
      ...completeExport,
      employees: [],
      memoryNotes: [],
      memoryJournal: [],
      routines: [],
      routineRuns: [],
      files: [],
      counts: {
        employees: 0,
        memoryNotes: 0,
        memoryJournal: 0,
        routines: 0,
        routineRuns: 0,
        files: 0,
      },
    }
    expect(workspaceExportDtoSchema.parse(empty)).toEqual(empty)
  })
})
