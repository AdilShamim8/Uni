import { z } from 'zod'
import { allowsKeyless, type ProviderAuthMode, type ProviderProtocol } from './providerDescriptors.js'

/**
 * Server provider connections (B03). Credentials are stored encrypted
 * (AES-256-GCM, workspace-scoped) and NEVER leave the server: every API
 * response carries redacted metadata only.
 */

export const providerKindSchema = z.enum(['openai-compatible', 'anthropic'])

/** The protocol a provider kind speaks on the wire. */
function protocolForKind(kind: z.infer<typeof providerKindSchema>): ProviderProtocol {
  return kind
}

/** The explicit credential transport a connection uses (N001). */
export const providerAuthModeSchema = z.enum(['none', 'bearer', 'native'])

/**
 * Keyless operation is only valid for protocols whose descriptor allows
 * it (OpenAI-compatible local runtimes); Anthropic requires a credential
 * in one of its two keyed transports.
 */
function validateAuthMode(kind: z.infer<typeof providerKindSchema>, authMode: ProviderAuthMode): boolean {
  if (authMode !== 'none') return true
  return allowsKeyless(protocolForKind(kind))
}

export const providerCredentialViewSchema = z.object({
  present: z.boolean(),
  keyId: z.string().nullable(),
  status: z.enum(['untested', 'connected', 'error']),
  lastCheckedAt: z.number().int().nullable(),
  lastError: z.string().nullable(),
})

export type ProviderCredentialView = z.infer<typeof providerCredentialViewSchema>

export const providerDtoSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  kind: providerKindSchema,
  /** Explicit credential transport for this connection (N001). */
  authMode: providerAuthModeSchema,
  endpointUrl: z.string(),
  /** Selected model id (manual entry or discovered). */
  modelId: z.string().nullable(),
  /** Known/discovered model ids. */
  models: z.array(z.string()),
  credential: providerCredentialViewSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

export type ProviderDto = z.infer<typeof providerDtoSchema>

export const createProviderRequestSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    kind: providerKindSchema,
    /**
     * Credential transport. Omitted: the compatible default — keyless
     * when the protocol allows it, the protocol's native keyed transport
     * otherwise.
     */
    authMode: providerAuthModeSchema.optional(),
    endpointUrl: z.string().trim().min(1).max(2000),
    modelId: z.string().trim().min(1).max(200).nullable().optional(),
    models: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.authMode === 'none' && !validateAuthMode(value.kind, 'none')) {
      ctx.addIssue({
        code: 'custom',
        path: ['authMode'],
        message: 'This protocol requires an API key — keyless connections are not supported for it.',
      })
    }
  })

export type CreateProviderRequest = z.infer<typeof createProviderRequestSchema>

export const patchProviderRequestSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    authMode: providerAuthModeSchema.optional(),
    endpointUrl: z.string().trim().min(1).max(2000).optional(),
    modelId: z.string().trim().min(1).max(200).nullable().optional(),
    models: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No fields to update.' })

export type PatchProviderRequest = z.infer<typeof patchProviderRequestSchema>

export const setCredentialRequestSchema = z.object({
  apiKey: z.string().min(1).max(4096),
})

export type SetCredentialRequest = z.infer<typeof setCredentialRequestSchema>

/**
 * One readiness axis of a provider connection check (N007): `unknown`
 * (this check proved nothing about the axis), `ok` (verified working),
 * or `fail` (verified broken). The axes are INDEPENDENT — a reachable
 * endpoint with a rejected key reports reachability ok + credential
 * fail, never a single blended "error".
 */
export const readinessAxisSchema = z.enum(['unknown', 'ok', 'fail'])

export type ReadinessAxis = z.infer<typeof readinessAxisSchema>

/**
 * The four separate readiness states of a provider connection (N007):
 * - `reachability`: did the endpoint answer on the network at all?
 * - `catalog`: did model discovery return a usable model list?
 * - `credential`: was the key verified? `not-required` when the
 *   connection is genuinely keyless (there is no key to verify).
 * - `generation`: was an actual generation exercised? A plain
 *   connection check does not generate, so this stays `unknown` until
 *   a generation-probe path (e.g. manual model verification) runs.
 */
export const providerReadinessSchema = z.object({
  reachability: readinessAxisSchema,
  catalog: readinessAxisSchema,
  credential: z.enum(['unknown', 'ok', 'fail', 'not-required']),
  generation: readinessAxisSchema,
})

export type ProviderReadiness = z.infer<typeof providerReadinessSchema>

/** All-unknown readiness — a cancelled or superseded check proved nothing. */
export function unknownReadiness(): ProviderReadiness {
  return { reachability: 'unknown', catalog: 'unknown', credential: 'unknown', generation: 'unknown' }
}

export const providerTestResponseSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  latencyMs: z.number().int().nonnegative().nullable(),
  discoveredModels: z.array(z.string()).nullable(),
  /** The per-axis breakdown behind the aggregate ok (N007). */
  readiness: providerReadinessSchema,
})

export type ProviderTestResponse = z.infer<typeof providerTestResponseSchema>
