import type { FastifyInstance } from 'fastify'
import {
  createRoutineRequestSchema,
  patchRoutineRequestSchema,
  routineDtoSchema,
  routineRunDtoSchema,
} from '@uni/contracts'
import { notFound } from '../../lib/errors.js'
import {
  createRoutine,
  deleteRoutine,
  getRoutine,
  listRoutines,
  patchRoutine,
} from './routines.service.js'

/**
 * Routine routes (T030). Session-scoped like every /api/v1 route: the
 * workspace is server-derived from the auth cookie; the referenced
 * agent session must belong to that workspace before a routine can be
 * created against it.
 */
export async function routineRoutes(app: FastifyInstance): Promise<void> {
  const db = app.database!.db

  app.get('/routines', async (request) => {
    const query = request.query as { includeArchived?: string }
    const includeArchived = query.includeArchived === 'true'
    const items = await listRoutines(db, request.workspace!.id, includeArchived)
    for (const routine of items) void routineDtoSchema.parse(routine)
    return { items }
  })

  app.get<{ Params: { routineId: string } }>('/routines/:routineId', async (request, reply) => {
    const result = await getRoutine(db, request.workspace!.id, request.params.routineId)
    if (!result) throw notFound('Routine not found.')
    void routineDtoSchema.parse(result.routine)
    for (const run of result.runs) void routineRunDtoSchema.parse(run)
    return result
  })

  app.post('/routines', async (request, reply) => {
    const body = createRoutineRequestSchema.parse(request.body ?? {})
    const routine = await createRoutine(db, request.workspace!.id, {
      employeeId: body.employeeId ?? null,
      name: body.name,
      prompt: body.prompt,
      schedule: body.schedule,
      catchUpMinutes: body.catchUpMinutes,
    })
    void routineDtoSchema.parse(routine)
    return reply.status(201).send(routine)
  })

  app.patch<{ Params: { routineId: string } }>('/routines/:routineId', async (request, reply) => {
    const body = patchRoutineRequestSchema.parse(request.body ?? {})
    const routine = await patchRoutine(db, request.workspace!.id, request.params.routineId, {
      name: body.name,
      prompt: body.prompt,
      schedule: body.schedule,
      catchUpMinutes: body.catchUpMinutes,
      paused: body.paused,
      archived: body.archived,
    })
    if (!routine) throw notFound('Routine not found.')
    void routineDtoSchema.parse(routine)
    return reply.status(200).send(routine)
  })

  app.delete<{ Params: { routineId: string } }>('/routines/:routineId', async (request, reply) => {
    const deleted = await deleteRoutine(db, request.workspace!.id, request.params.routineId)
    if (!deleted) throw notFound('Routine not found.')
    return reply.status(204).send()
  })
}
