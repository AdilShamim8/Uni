import { desc, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { employees, memoryNotes, routines, fileDocuments } from '../../db/schema.js'
import { workspaceExportDtoSchema, type WorkspaceExportDto } from '@uni/contracts'

/**
 * Workspace export (B07): one honest snapshot of the workspace's own
 * data. Every query is workspace-scoped by construction; counts are
 * derived from the serialized arrays so the envelope can never claim
 * more than it carries.
 */

export type WorkspaceDatabase = NodePgDatabase<typeof schema>

export async function buildWorkspaceExport(
  db: WorkspaceDatabase,
  workspaceId: string,
): Promise<WorkspaceExportDto> {
  const [employeeRows, noteRows, routineRows, fileRows] = await Promise.all([
    db.select().from(employees).where(eq(employees.workspaceId, workspaceId)).orderBy(desc(employees.updatedAt)),
    db.select().from(memoryNotes).where(eq(memoryNotes.workspaceId, workspaceId)).orderBy(desc(memoryNotes.updatedAt)),
    db.select().from(routines).where(eq(routines.workspaceId, workspaceId)).orderBy(desc(routines.createdAt)),
    db.select().from(fileDocuments).where(eq(fileDocuments.workspaceId, workspaceId)).orderBy(desc(fileDocuments.createdAt)),
  ])

  const dto: WorkspaceExportDto = {
    format: 'uni.workspace.export/1',
    exportedAt: Date.now(),
    employees: employeeRows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      instructions: row.instructions,
      category: row.category,
      providerId: row.providerId,
      modelId: row.modelId,
      tools: Array.isArray(row.tools) ? row.tools : [],
      starters: Array.isArray(row.starters) ? row.starters : [],
      archived: row.archived,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    })),
    memoryNotes: noteRows.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      text: row.text,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    })),
    routines: routineRows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      employeeId: row.employeeId,
      name: row.name,
      prompt: row.prompt,
      schedule: row.schedule,
      catchUpMinutes: row.catchUpMinutes,
      paused: row.paused,
      archived: row.archived,
      lastFireAt: row.lastFireAt ? row.lastFireAt.getTime() : null,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    })),
    files: fileRows.map((row) => ({
      id: row.id,
      title: row.title,
      fileName: row.fileName,
      extension: row.extension,
      mimeType: row.mimeType,
      extraction: row.extraction,
      extractedText: row.extractedText,
      charCount: row.charCount,
      createdAt: row.createdAt.getTime(),
    })),
    counts: {
      employees: employeeRows.length,
      memoryNotes: noteRows.length,
      routines: routineRows.length,
      files: fileRows.length,
    },
  }
  // The contract parse is the shape guarantee callers rely on.
  return workspaceExportDtoSchema.parse(dto)
}
