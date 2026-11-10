import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { agentSessions } from '../../db/schema.js'
import { notFound } from '../../lib/errors.js'
import { deriveSessionRootDir } from './sessionStore.js'
import type {
  AgentSessionDto,
  CreateAgentSessionRequest,
  PatchAgentSessionRequest,
} from '@uni/contracts'

export type AgentDatabase = NodePgDatabase<typeof schema>

type SessionRow = typeof agentSessions.$inferSelect

export function serializeSession(row: SessionRow): AgentSessionDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    mode: row.mode as AgentSessionDto['mode'],
    status: row.status as AgentSessionDto['status'],
    providerId: row.providerId,
    modelId: row.modelId,
    rootDir: row.rootDir,
    tools: Array.isArray(row.tools) ? row.tools : [],
    archived: row.archived,
    createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : new Date(row.createdAt).getTime(),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.getTime() : new Date(row.updatedAt).getTime(),
  }
}

export async function findSessionRow(
  db: AgentDatabase,
  workspaceId: string,
  sessionId: string,
): Promise<SessionRow | null> {
  const rows = await db
    .select()
    .from(agentSessions)
    .where(and(eq(agentSessions.id, sessionId), eq(agentSessions.workspaceId, workspaceId)))
    .limit(1)
  return rows[0] ?? null
}

export async function listSessions(
  db: AgentDatabase,
  workspaceId: string,
  includeArchived: boolean,
): Promise<AgentSessionDto[]> {
  const rows = await db
    .select()
    .from(agentSessions)
    .where(
      includeArchived
        ? eq(agentSessions.workspaceId, workspaceId)
        : and(eq(agentSessions.workspaceId, workspaceId), eq(agentSessions.archived, false)),
    )
    .orderBy(agentSessions.createdAt)
  return rows.map(serializeSession)
}

export async function createSession(
  db: AgentDatabase,
  workspaceId: string,
  request: CreateAgentSessionRequest,
): Promise<AgentSessionDto> {
  const id = randomUUID()
  // Server-owned unique root (F01): every session gets a directory of its
  // own under the workspace agent root — no shared 'sessions/default',
  // no cross-session collisions. Legacy rows keep their stored rootDir.
  const rootDir = deriveSessionRootDir(id, request.rootDir)
  const inserted = await db
    .insert(agentSessions)
    .values({
      id,
      workspaceId,
      name: request.name,
      description: request.description ?? '',
      mode: request.mode ?? 'default',
      status: 'idle',
      providerId: request.providerId ?? null,
      modelId: request.modelId ?? null,
      rootDir,
      tools: request.tools ?? [],
      employeeId: request.employeeId ?? null,
    })
    .returning()
  const row = inserted[0]
  if (!row) throw new Error('Agent session insert returned no row')
  return serializeSession(row)
}

export async function patchSession(
  db: AgentDatabase,
  workspaceId: string,
  sessionId: string,
  request: PatchAgentSessionRequest,
): Promise<AgentSessionDto> {
  const updated = await db
    .update(agentSessions)
    .set({
      ...(request.name !== undefined ? { name: request.name } : {}),
      ...(request.description !== undefined ? { description: request.description } : {}),
      ...(request.mode !== undefined ? { mode: request.mode } : {}),
      ...(request.providerId !== undefined ? { providerId: request.providerId } : {}),
      ...(request.modelId !== undefined ? { modelId: request.modelId } : {}),
      ...(request.tools !== undefined ? { tools: request.tools } : {}),
      ...(request.archived !== undefined ? { archived: request.archived } : {}),
      ...(request.employeeId !== undefined ? { employeeId: request.employeeId } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(agentSessions.id, sessionId), eq(agentSessions.workspaceId, workspaceId)))
    .returning()
  const row = updated[0]
  if (!row) throw notFound('Agent session not found.')
  return serializeSession(row)
}

export async function deleteSession(
  db: AgentDatabase,
  workspaceId: string,
  sessionId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(agentSessions)
    .where(and(eq(agentSessions.id, sessionId), eq(agentSessions.workspaceId, workspaceId)))
    .returning({ id: agentSessions.id })
  return deleted.length > 0
}
