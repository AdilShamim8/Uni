import type { FastifyInstance } from 'fastify'
import {
  createWorkTaskRequestSchema,
  patchWorkTaskRequestSchema,
  workTaskActionRequestSchema,
  workTaskDtoSchema,
  workRunDtoSchema,
} from '@uni/contracts'
import { notFound } from '../../lib/errors.js'
import {
  createWorkTask,
  deleteWorkTask,
  getWorkTask,
  listWorkTasks,
  patchWorkTask,
  startWorkTask,
} from './work.service.js'

/**
 * Work routes (T018). All routes are session-scoped (the workspace comes
 * from the authenticated request, never the payload). Start delegates to
 * the agent engine's admission path; cancel/answer arrive with T019's
 * engine wiring and stay honest 409s until then.
 */
export async function workRoutes(app: FastifyInstance): Promise<void> {
  const db = app.database!.db
  const env = app.env

  app.get('/work/tasks', async (request) => {
    const query = request.query as { includeCancelled?: string }
    const includeCancelled = query.includeCancelled === 'true'
    const items = await listWorkTasks(db, request.workspace!.id, includeCancelled)
    for (const task of items) void workTaskDtoSchema.parse(task)
    return { items }
  })

  app.get<{ Params: { taskId: string } }>('/work/tasks/:taskId', async (request, reply) => {
    const result = await getWorkTask(db, request.workspace!.id, request.params.taskId)
    if (!result) throw notFound('Work task not found.')
    void workTaskDtoSchema.parse(result.task)
    for (const run of result.runs) void workRunDtoSchema.parse(run)
    return result
  })

  app.post('/work/tasks', async (request, reply) => {
    const body = createWorkTaskRequestSchema.parse(request.body ?? {})
    const task = await createWorkTask(db, request.workspace!.id, {
      title: body.title,
      goal: body.goal,
      deliverable: body.deliverable,
      employeeId: body.employeeId ?? null,
    })
    void workTaskDtoSchema.parse(task)
    return reply.status(201).send(task)
  })

  app.patch<{ Params: { taskId: string } }>('/work/tasks/:taskId', async (request, reply) => {
    const body = patchWorkTaskRequestSchema.parse(request.body ?? {})
    const task = await patchWorkTask(db, request.workspace!.id, request.params.taskId, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.goal !== undefined ? { goal: body.goal } : {}),
      ...(body.deliverable !== undefined ? { deliverable: body.deliverable } : {}),
      ...(body.employeeId !== undefined ? { employeeId: body.employeeId } : {}),
      ...(body.artifactId !== undefined ? { artifactId: body.artifactId } : {}),
    })
    if (!task) throw notFound('Work task not found.')
    void workTaskDtoSchema.parse(task)
    return reply.send(task)
  })

  app.delete<{ Params: { taskId: string } }>('/work/tasks/:taskId', async (request, reply) => {
    const deleted = await deleteWorkTask(db, request.workspace!.id, request.params.taskId)
    if (!deleted) throw notFound('Work task not found.')
    return reply.status(204).send()
  })

  app.post<{ Params: { taskId: string } }>('/work/tasks/:taskId/actions', async (request, reply) => {
    const body = workTaskActionRequestSchema.parse(request.body ?? {})
    if (body.action === 'start') {
      const result = await startWorkTask(
        { db, env },
        request.workspace!.id,
        request.params.taskId,
      )
      if (!result) throw notFound('Work task not found.')
      void workTaskDtoSchema.parse(result.task)
      void workRunDtoSchema.parse(result.run)
      return reply.status(202).send(result)
    }
    // cancel/answer land with T019's engine wiring (run outcome sync).
    throw notFound('This task action is not available yet.')
  })
}
