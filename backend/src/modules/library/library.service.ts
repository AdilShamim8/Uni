import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { libraryArtifactVersions, libraryArtifacts } from '../../db/schema.js'
import { notFound } from '../../lib/errors.js'
import type {
  CanonicalSaveResult,
  CreateLibraryArtifactRequest,
  LibraryArtifactDto,
  LibraryArtifactVersionDto,
  LibraryGeneratedBy,
  PatchLibraryArtifactRequest,
} from '@uni/contracts'

export type LibraryDatabase = NodePgDatabase<typeof schema>

type ArtifactRow = typeof libraryArtifacts.$inferSelect

function toMillis(value: Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

export function serializeArtifact(row: ArtifactRow): LibraryArtifactDto {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind as LibraryArtifactDto['kind'],
    markdown: row.markdown,
    provenance: row.provenance as LibraryArtifactDto['provenance'],
    generatedBy: (row.generatedBy as LibraryGeneratedBy | null) ?? null,
    taskId: row.taskId,
    sourceConversationId: row.sourceConversationId,
    sourceMessageId: row.sourceMessageId,
    versionCount: row.versionCount,
    createdAt: toMillis(row.createdAt),
    updatedAt: toMillis(row.updatedAt),
  }
}

function serializeVersion(row: typeof libraryArtifactVersions.$inferSelect): LibraryArtifactVersionDto {
  return {
    version: row.version,
    title: row.title,
    markdown: row.markdown,
    createdAt: toMillis(row.createdAt),
  }
}

export async function findArtifactRow(
  db: LibraryDatabase,
  workspaceId: string,
  artifactId: string,
): Promise<ArtifactRow | null> {
  const rows = await db
    .select()
    .from(libraryArtifacts)
    .where(and(eq(libraryArtifacts.id, artifactId), eq(libraryArtifacts.workspaceId, workspaceId)))
    .limit(1)
  return rows[0] ?? null
}

export async function listArtifacts(
  db: LibraryDatabase,
  workspaceId: string,
): Promise<LibraryArtifactDto[]> {
  const rows = await db
    .select()
    .from(libraryArtifacts)
    .where(eq(libraryArtifacts.workspaceId, workspaceId))
    .orderBy(desc(libraryArtifacts.updatedAt))
  return rows.map(serializeArtifact)
}

export async function getArtifact(
  db: LibraryDatabase,
  workspaceId: string,
  artifactId: string,
): Promise<LibraryArtifactDto> {
  const row = await findArtifactRow(db, workspaceId, artifactId)
  if (!row) throw notFound('Artifact not found.')
  return serializeArtifact(row)
}

export async function listArtifactVersions(
  db: LibraryDatabase,
  workspaceId: string,
  artifactId: string,
): Promise<LibraryArtifactVersionDto[]> {
  await getArtifact(db, workspaceId, artifactId)
  const rows = await db
    .select()
    .from(libraryArtifactVersions)
    .where(eq(libraryArtifactVersions.artifactId, artifactId))
    .orderBy(desc(libraryArtifactVersions.version))
  return rows.map(serializeVersion)
}

/* ------------------------------------------------------------------ */
/* Writes — artifact + version rows move in ONE transaction           */
/* ------------------------------------------------------------------ */

interface ArtifactContent {
  title: string
  kind: LibraryArtifactDto['kind']
  markdown: string
  provenance: LibraryArtifactDto['provenance']
  generatedBy: LibraryGeneratedBy | null
  taskId: string | null
  sourceConversationId: string | null
  sourceMessageId: string | null
}

async function insertArtifactWithVersion(
  db: LibraryDatabase,
  workspaceId: string,
  content: ArtifactContent,
): Promise<ArtifactRow> {
  const id = randomUUID()
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(libraryArtifacts)
      .values({
        id,
        workspaceId,
        title: content.title,
        kind: content.kind,
        markdown: content.markdown,
        provenance: content.provenance,
        generatedBy: content.generatedBy,
        taskId: content.taskId,
        sourceConversationId: content.sourceConversationId,
        sourceMessageId: content.sourceMessageId,
        versionCount: 1,
      })
      .returning()
    const row = inserted[0]
    if (!row) throw new Error('Artifact insert returned no row')
    await tx.insert(libraryArtifactVersions).values({
      id: randomUUID(),
      artifactId: id,
      version: 1,
      title: content.title,
      markdown: content.markdown,
    })
    return row
  })
}

/**
 * Update in place — and ONLY when something actually changed, so
 * repeated saves never churn `updatedAt` or create noise versions
 * (the m07 no-duplicate-documents rule).
 */
async function updateArtifactWithVersion(
  db: LibraryDatabase,
  workspaceId: string,
  artifactId: string,
  content: ArtifactContent,
): Promise<{ row: ArtifactRow; changed: boolean }> {
  return db.transaction(async (tx) => {
    const current = await tx
      .select()
      .from(libraryArtifacts)
      .where(and(eq(libraryArtifacts.id, artifactId), eq(libraryArtifacts.workspaceId, workspaceId)))
      .limit(1)
    const currentRow = current[0]
    if (!currentRow) throw notFound('Artifact not found.')
    const titleChanged = currentRow.title !== content.title
    const markdownChanged = currentRow.markdown !== content.markdown
    if (!titleChanged && !markdownChanged) {
      return { row: currentRow, changed: false }
    }
    const nextVersion = currentRow.versionCount + 1
    const updated = await tx
      .update(libraryArtifacts)
      .set({
        title: content.title,
        markdown: content.markdown,
        versionCount: nextVersion,
        updatedAt: new Date(),
      })
      .where(and(eq(libraryArtifacts.id, artifactId), eq(libraryArtifacts.workspaceId, workspaceId)))
      .returning()
    const row = updated[0]
    if (!row) throw new Error('Artifact update returned no row')
    await tx.insert(libraryArtifactVersions).values({
      id: randomUUID(),
      artifactId,
      version: nextVersion,
      title: content.title,
      markdown: content.markdown,
    })
    return { row, changed: true }
  })
}

export async function createArtifact(
  db: LibraryDatabase,
  workspaceId: string,
  request: CreateLibraryArtifactRequest,
): Promise<LibraryArtifactDto> {
  const row = await insertArtifactWithVersion(db, workspaceId, {
    title: request.title,
    kind: request.kind,
    markdown: request.markdown,
    provenance: request.provenance ?? 'demo-simulation',
    generatedBy: request.generatedBy ?? null,
    taskId: request.taskId ?? null,
    sourceConversationId: request.sourceConversationId ?? null,
    sourceMessageId: request.sourceMessageId ?? null,
  })
  return serializeArtifact(row)
}

export async function patchArtifact(
  db: LibraryDatabase,
  workspaceId: string,
  artifactId: string,
  request: PatchLibraryArtifactRequest,
): Promise<LibraryArtifactDto> {
  const current = await findArtifactRow(db, workspaceId, artifactId)
  if (!current) throw notFound('Artifact not found.')
  const { row } = await updateArtifactWithVersion(db, workspaceId, artifactId, {
    title: request.title ?? current.title,
    kind: current.kind as ArtifactContent['kind'],
    markdown: request.markdown ?? current.markdown,
    provenance: current.provenance as ArtifactContent['provenance'],
    generatedBy: (current.generatedBy as LibraryGeneratedBy | null) ?? null,
    taskId: current.taskId,
    sourceConversationId: current.sourceConversationId,
    sourceMessageId: current.sourceMessageId,
  })
  return serializeArtifact(row)
}

export async function deleteArtifact(
  db: LibraryDatabase,
  workspaceId: string,
  artifactId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(libraryArtifacts)
    .where(and(eq(libraryArtifacts.id, artifactId), eq(libraryArtifacts.workspaceId, workspaceId)))
    .returning({ id: libraryArtifacts.id })
  return deleted.length > 0
}

/* ------------------------------------------------------------------ */
/* Canonical save — the ONE operation per source of truth (m07)       */
/* ------------------------------------------------------------------ */

export interface CanonicalSaveInput {
  title: string
  kind: ArtifactContent['kind']
  markdown: string
  provenance: ArtifactContent['provenance']
  generatedBy: LibraryGeneratedBy | null
  taskId: string | null
  sourceConversationId: string | null
  sourceMessageId: string | null
  /** The artifact the caller believes it is updating, if any. */
  linkedArtifactId: string | null
}

/**
 * The canonical save path — the m07 conflict rules as one server
 * transaction:
 *
 * 1. A linked artifact that still exists is updated IN PLACE, and only
 *    when content actually changed (no version churn).
 * 2. A linked artifact that was deleted is recreated explicitly and
 *    re-linked, so caller and Library agree again instead of silently
 *    duplicating.
 * 3. One artifact per saved reply: an existing artifact with the same
 *    sourceMessageId is updated rather than twinned.
 * 4. Otherwise a new artifact is created with version 1.
 */
export async function canonicalSave(
  db: LibraryDatabase,
  workspaceId: string,
  input: CanonicalSaveInput,
): Promise<CanonicalSaveResult> {
  const content: ArtifactContent = {
    title: input.title,
    kind: input.kind,
    markdown: input.markdown,
    provenance: input.provenance,
    generatedBy: input.generatedBy,
    taskId: input.taskId,
    sourceConversationId: input.sourceConversationId,
    sourceMessageId: input.sourceMessageId,
  }

  // Rule 1/2: the caller's linked artifact.
  if (input.linkedArtifactId) {
    const linked = await findArtifactRow(db, workspaceId, input.linkedArtifactId)
    if (linked) {
      const { row } = await updateArtifactWithVersion(db, workspaceId, linked.id, content)
      return {
        artifactId: row.id,
        created: false,
        recreated: false,
        title: row.title,
        version: row.versionCount,
      }
    }
    // Linked artifact was deleted: explicit recreate path below.
  }

  // Rule 3: one artifact per saved reply.
  if (input.sourceMessageId) {
    const existing = await db
      .select()
      .from(libraryArtifacts)
      .where(
        and(
          eq(libraryArtifacts.workspaceId, workspaceId),
          eq(libraryArtifacts.sourceMessageId, input.sourceMessageId),
        ),
      )
      .limit(1)
    const twin = existing[0]
    if (twin) {
      const { row } = await updateArtifactWithVersion(db, workspaceId, twin.id, content)
      return {
        artifactId: row.id,
        created: false,
        recreated: false,
        title: row.title,
        version: row.versionCount,
      }
    }
  }

  // Rule 2 (recreate) / Rule 4 (create).
  const row = await insertArtifactWithVersion(db, workspaceId, content)
  return {
    artifactId: row.id,
    created: true,
    recreated: input.linkedArtifactId !== null,
    title: row.title,
    version: row.versionCount,
  }
}
