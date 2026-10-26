import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { employees } from '../../db/schema.js'
import { notFound } from '../../lib/errors.js'
import type {
  CreateEmployeeRequest,
  EmployeeDto,
  PatchEmployeeRequest,
} from '@uni/contracts'

export type EmployeesDatabase = NodePgDatabase<typeof schema>

type EmployeeRow = typeof employees.$inferSelect

function toMillis(value: Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

export function serializeEmployee(row: EmployeeRow): EmployeeDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    category: row.category as EmployeeDto['category'],
    providerId: row.providerId,
    modelId: row.modelId,
    tools: Array.isArray(row.tools) ? row.tools : [],
    starters: Array.isArray(row.starters) ? row.starters : [],
    archived: row.archived,
    createdAt: toMillis(row.createdAt),
    updatedAt: toMillis(row.updatedAt),
  }
}

export async function findEmployeeRow(
  db: EmployeesDatabase,
  workspaceId: string,
  employeeId: string,
): Promise<EmployeeRow | null> {
  const rows = await db
    .select()
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
    .limit(1)
  return rows[0] ?? null
}

export async function listEmployees(
  db: EmployeesDatabase,
  workspaceId: string,
  includeArchived: boolean,
): Promise<EmployeeDto[]> {
  const rows = await db
    .select()
    .from(employees)
    .where(
      includeArchived
        ? eq(employees.workspaceId, workspaceId)
        : and(eq(employees.workspaceId, workspaceId), eq(employees.archived, false)),
    )
    .orderBy(employees.createdAt)
  return rows.map(serializeEmployee)
}

export async function createEmployee(
  db: EmployeesDatabase,
  workspaceId: string,
  request: CreateEmployeeRequest,
): Promise<EmployeeDto> {
  const inserted = await db
    .insert(employees)
    .values({
      id: randomUUID(),
      workspaceId,
      name: request.name,
      description: request.description ?? '',
      instructions: request.instructions ?? '',
      category: request.category ?? 'personal',
      providerId: request.providerId ?? null,
      modelId: request.modelId ?? null,
      tools: request.tools ?? [],
      starters: request.starters ?? [],
    })
    .returning()
  const row = inserted[0]
  if (!row) throw new Error('Employee insert returned no row')
  return serializeEmployee(row)
}

export async function patchEmployee(
  db: EmployeesDatabase,
  workspaceId: string,
  employeeId: string,
  request: PatchEmployeeRequest,
): Promise<EmployeeDto> {
  const updated = await db
    .update(employees)
    .set({
      ...(request.name !== undefined ? { name: request.name } : {}),
      ...(request.description !== undefined ? { description: request.description } : {}),
      ...(request.instructions !== undefined ? { instructions: request.instructions } : {}),
      ...(request.category !== undefined ? { category: request.category } : {}),
      ...(request.providerId !== undefined ? { providerId: request.providerId } : {}),
      ...(request.modelId !== undefined ? { modelId: request.modelId } : {}),
      ...(request.tools !== undefined ? { tools: request.tools } : {}),
      ...(request.starters !== undefined ? { starters: request.starters } : {}),
      ...(request.archived !== undefined ? { archived: request.archived } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
    .returning()
  const row = updated[0]
  if (!row) throw notFound('Employee not found.')
  return serializeEmployee(row)
}

export async function deleteEmployee(
  db: EmployeesDatabase,
  workspaceId: string,
  employeeId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
    .returning({ id: employees.id })
  return deleted.length > 0
}
