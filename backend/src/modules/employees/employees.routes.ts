import type { FastifyInstance } from 'fastify'
import {
  createEmployeeRequestSchema,
  employeeDtoSchema,
  patchEmployeeRequestSchema,
} from '@uni/contracts'
import { notFound } from '../../lib/errors.js'
import {
  createEmployee,
  deleteEmployee,
  listEmployees,
  patchEmployee,
} from './employees.service.js'

/**
 * Employee (agent profile) routes. Every read and write is scoped to the
 * session's workspace — employee ids from other workspaces simply do not
 * resolve (404, not 403: existence is not leaked).
 */
export async function employeesRoutes(app: FastifyInstance): Promise<void> {
  const db = app.database!.db

  app.get('/employees', async (request) => {
    const includeArchived = request.query instanceof URLSearchParams
      ? false
      : (request.query as { archived?: string } | undefined)?.archived === 'true'
    const items = await listEmployees(db, request.workspace!.id, includeArchived)
    for (const employee of items) {
      void employeeDtoSchema.parse(employee)
    }
    return { items }
  })

  app.post('/employees', async (request, reply) => {
    const body = createEmployeeRequestSchema.parse(request.body ?? {})
    const employee = await createEmployee(db, request.workspace!.id, body)
    void employeeDtoSchema.parse(employee)
    return void reply.status(201).send(employee)
  })

  app.patch<{ Params: { id: string } }>('/employees/:id', async (request, reply) => {
    const body = patchEmployeeRequestSchema.parse(request.body ?? {})
    const employee = await patchEmployee(db, request.workspace!.id, request.params.id, body)
    void employeeDtoSchema.parse(employee)
    return reply.send(employee)
  })

  app.delete<{ Params: { id: string } }>('/employees/:id', async (request, reply) => {
    const deleted = await deleteEmployee(db, request.workspace!.id, request.params.id)
    if (!deleted) throw notFound('Employee not found.')
    return void reply.status(204).send()
  })
}
