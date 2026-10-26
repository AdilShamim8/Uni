import { z } from 'zod'

/**
 * GET /api/v1/me — the signed-in user plus their resolved workspace.
 * B02 resolves the personal workspace; later gates may expose the active
 * workspace among memberships.
 */
export const meResponseSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    email: z.string().min(1),
    name: z.string().min(1),
    createdAt: z.number().int().nonnegative(),
  }),
  workspace: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    role: z.string().min(1),
  }),
})

export type MeResponse = z.infer<typeof meResponseSchema>
