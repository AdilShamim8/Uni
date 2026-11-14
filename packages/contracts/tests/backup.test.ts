import { describe, expect, it } from 'vitest'
import {
  BACKUP_KIND,
  IMPORTABLE_SECTIONS,
  UNSUPPORTED_SECTION_LABELS,
  importCommitResponseSchema,
  importPreviewResponseSchema,
  workspaceBackupSchema,
} from '../src/index.js'

/**
 * The versioned local backup format the server validates on import:
 * unimplemented sections are tolerated and reported, temporary chats
 * are never imported while labeled temporary.
 */
const minimalBackup = {
  kind: 'uni-workspace-backup',
  version: 1,
  savedAt: 1_700_000_000_000,
  payload: {
    app: {
      conversations: [
        {
          id: 'cv_1',
          title: 'Local thread',
          createdAt: 1,
          updatedAt: 1,
          nodes: {
            nd_1: {
              id: 'nd_1',
              role: 'user',
              content: 'Hello',
              createdAt: 1,
              status: 'complete',
            },
          },
        },
      ],
    },
  },
}

describe('backup envelope', () => {
  it('accepts the versioned kind and a minimal conversation payload', () => {
    expect(workspaceBackupSchema.parse(minimalBackup)).toEqual(minimalBackup)
  })

  it('rejects any other kind or version', () => {
    expect(workspaceBackupSchema.safeParse({ ...minimalBackup, kind: 'other' }).success).toBe(false)
    expect(workspaceBackupSchema.safeParse({ ...minimalBackup, version: 2 }).success).toBe(false)
    expect(BACKUP_KIND).toBe('uni-workspace-backup')
  })

  it('tolerates sections the server has not implemented (passthrough)', () => {
    const withExtras = {
      ...minimalBackup,
      payload: {
        ...minimalBackup.payload,
        providers: [{ id: 'p1' }],
        preferences: { theme: 'dark' },
      },
    }
    expect(workspaceBackupSchema.safeParse(withExtras).success).toBe(true)
  })

  it('backup nodes may carry streaming — the local snapshot froze mid-stream', () => {
    const streaming = {
      ...minimalBackup,
      payload: {
        app: {
          conversations: [
            {
              ...minimalBackup.payload.app.conversations[0]!,
              nodes: {
                nd_1: {
                  id: 'nd_1',
                  role: 'assistant',
                  content: 'Half an answer',
                  createdAt: 1,
                  status: 'streaming',
                },
              },
            },
          ],
        },
      },
    }
    expect(workspaceBackupSchema.safeParse(streaming).success).toBe(true)
  })

  it('conversations may be flagged temporary — the importer must skip them', () => {
    const temporary = {
      ...minimalBackup,
      payload: {
        app: {
          conversations: [
            { ...minimalBackup.payload.app.conversations[0]!, temporary: true },
          ],
        },
      },
    }
    expect(workspaceBackupSchema.safeParse(temporary).success).toBe(true)
  })
})

describe('import section reporting', () => {
  it('conversations is the only importable section today', () => {
    expect([...IMPORTABLE_SECTIONS]).toEqual(['conversations'])
  })

  it('every unimplemented section has an honest label', () => {
    expect(Object.keys(UNSUPPORTED_SECTION_LABELS).sort()).toEqual(
      ['agents', 'context', 'library', 'plugins', 'preferences', 'providers', 'work'].sort(),
    )
  })
})

describe('import preview + commit responses', () => {
  it('the dry-run preview counts honestly and lists errors', () => {
    const preview = {
      checksum: 'abc123def0',
      counts: { conversations: 1, messages: 1, skippedTemporary: 0 },
      errors: [],
      unsupported: ['providers'],
    }
    expect(importPreviewResponseSchema.parse(preview)).toEqual(preview)
    expect(
      importPreviewResponseSchema.safeParse({ ...preview, checksum: 'short' }).success,
    ).toBe(false)
  })

  it('the commit result reports idempotent replay and the id map', () => {
    const commit = {
      batchId: 'batch_1',
      imported: { conversations: 1, messages: 1 },
      skippedTemporary: 0,
      unsupported: [],
      idempotentReplay: false,
      conversationIdMap: { cv_1: 'srv_cv_1' },
    }
    expect(importCommitResponseSchema.parse(commit)).toEqual(commit)
  })
})
