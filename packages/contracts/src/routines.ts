import { z } from 'zod'

/**
 * Routine contracts (T030, P09) — prompts run on a schedule inside an
 * agent session, in the unattended mode (spawn-only, allowlisted tools,
 * never asks — the session mode the agent contracts define).
 *
 * The schedule is a 5-field cron expression (minute hour day-of-month
 * month day-of-week), evaluated by a minute-tick scheduler in UTC.
 * `catchUpMinutes` bounds how far after downtime a missed fire may
 * still run; older minutes are skipped and recorded as such.
 *
 * Terminal statuses mirror agent runs so the UI maps one-to-one.
 */

/* ------------------------------------------------------------------ */
/* Schedule vocabulary                                                 */
/* ------------------------------------------------------------------ */

/**
 * A 5-field cron expression: minute, hour, day-of-month, month,
 * day-of-week (0 or 7 = Sunday). Fields accept the star, every-nth
 * step values, ranges, comma lists, and single values — the subset
 * the scheduler evaluates deterministically. The string is validated
 * structurally here; the parser lives in the backend (pure,
 * unit-tested) and the DTO carries the exact user-entered expression.
 */
export const routineScheduleExpressionSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => value.split(/\s+/).length === 5, {
    message: 'Schedule must be exactly 5 cron fields (minute hour day month weekday).',
  })
export type RoutineScheduleExpression = z.infer<typeof routineScheduleExpressionSchema>

/* ------------------------------------------------------------------ */
/* Routine                                                             */
/* ------------------------------------------------------------------ */

export const routineDtoSchema = z.object({
  id: z.string().min(1),
  /**
   * The routine's own agent session — provisioned server-side at
   * creation in the unattended mode with a read-only roster.
   */
  sessionId: z.string().min(1),
  /** The employee the routine executes as, when linked. */
  employeeId: z.string().nullable(),
  /**
   * The linked employee's name at read time (null when unpinned, or
   * when the employee row is gone — the pin is soft, history survives).
   */
  employeeName: z.string().nullable(),
  name: z.string().min(1).max(200),
  prompt: z.string().min(1).max(10_000),
  /** 5-field cron expression, UTC. */
  schedule: routineScheduleExpressionSchema,
  /** Minutes a missed fire may be caught up after downtime (0 = skip). */
  catchUpMinutes: z.number().int().min(0).max(60 * 24 * 7),
  paused: z.boolean(),
  archived: z.boolean(),
  /** Last fire start (epoch ms); null before the first fire. */
  lastFireAt: z.number().int().nonnegative().nullable(),
  /**
   * The next scheduled minute (epoch ms) computed by the server's own
   * cron evaluator at read time — the single truth for previews. Null
   * when nothing matches within the 7-day horizon (or while paused).
   */
  nextFireAt: z.number().int().nonnegative().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type RoutineDto = z.infer<typeof routineDtoSchema>

export const createRoutineRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(10_000),
  schedule: routineScheduleExpressionSchema,
  catchUpMinutes: z.number().int().min(0).max(60 * 24 * 7).default(0),
  /**
   * Optional employee (AI worker) the routine executes as: the pinned
   * provider/model and instructions come from the employee at run time.
   * The routine's OWN session is provisioned server-side in the
   * unattended mode with a read-only roster — a scheduled task never
   * inherits interactive permissions (it cannot ask, and it cannot
   * mutate).
   */
  employeeId: z.string().trim().min(1).max(200).nullable().optional(),
})
export type CreateRoutineRequest = z.infer<typeof createRoutineRequestSchema>

export const patchRoutineRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    prompt: z.string().trim().min(1).max(10_000).optional(),
    schedule: routineScheduleExpressionSchema.optional(),
    catchUpMinutes: z.number().int().min(0).max(60 * 24 * 7).optional(),
    paused: z.boolean().optional(),
    archived: z.boolean().optional(),
    /**
     * Re-pin the routine to another employee (null unpins). The
     * provisioned session's employee/provider/model follow the pin so
     * execution matches what the UI shows.
     */
    employeeId: z.string().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No fields to update.' })
export type PatchRoutineRequest = z.infer<typeof patchRoutineRequestSchema>

/* ------------------------------------------------------------------ */
/* Routine runs                                                        */
/* ------------------------------------------------------------------ */

export const routineRunStatusSchema = z.enum([
  'pending',
  'running',
  'complete',
  'stopped',
  'error',
  'skipped',
])
export type RoutineRunStatus = z.infer<typeof routineRunStatusSchema>

/**
 * One fire of a routine, keyed by its scheduled minute (UTC, truncated
 * to the minute). `skipped` fires are recorded honestly when the
 * scheduled minute fell outside the catch-up window.
 */
export const routineRunDtoSchema = z.object({
  id: z.string().min(1),
  routineId: z.string().min(1),
  /** Which scheduled minute this fire belongs to (epoch ms, UTC). */
  scheduledFor: z.number().int().nonnegative(),
  status: routineRunStatusSchema,
  /** The agent run the fire executed as, when it ran. */
  agentRunId: z.string().nullable(),
  /** The run's final output (bounded); empty until terminal. */
  outputText: z.string().max(200_000),
  errorCode: z.string().max(100).nullable(),
  errorMessage: z.string().max(2_000).nullable(),
  createdAt: z.number().int().nonnegative(),
  terminalAt: z.number().int().nonnegative().nullable(),
})
export type RoutineRunDto = z.infer<typeof routineRunDtoSchema>
