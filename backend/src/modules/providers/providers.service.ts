import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { providerConnections } from '../../db/schema.js'
import { badRequest, notFound } from '../../lib/errors.js'
import { withTimeout } from '../../lib/timeout.js'
import {
  decryptSecret,
  encryptSecret,
  envelopeKeyId,
  parseMasterKey,
  type SecretEnvelope,
} from '../../lib/secretBox.js'
import { resolveProviderEndpoint, UrlGuardError } from '../../lib/urlGuard.js'
import type { Env } from '../../config/env.js'
import type {
  CreateProviderRequest,
  PatchProviderRequest,
  ProviderDto,
  ProviderTestResponse,
} from '@uni/contracts'

export type ProvidersDatabase = NodePgDatabase<typeof schema>

type ProviderRow = typeof providerConnections.$inferSelect

function toMillis(value: Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

function serializeProvider(row: ProviderRow): ProviderDto {
  return {
    id: row.id,
    label: row.label,
    kind: row.kind as ProviderDto['kind'],
    endpointUrl: row.endpointUrl,
    modelId: row.modelId,
    models: Array.isArray(row.models) ? row.models : [],
    credential: {
      present: row.credentialEnvelope !== null,
      keyId: envelopeKeyId(row.credentialEnvelope),
      status: row.credentialStatus as 'untested' | 'connected' | 'error',
      lastCheckedAt: row.credentialLastCheckedAt ? toMillis(row.credentialLastCheckedAt) : null,
      lastError: row.credentialLastError,
    },
    createdAt: toMillis(row.createdAt),
    updatedAt: toMillis(row.updatedAt),
  }
}

async function findProvider(
  db: ProvidersDatabase,
  workspaceId: string,
  providerId: string,
): Promise<ProviderRow | null> {
  const rows = await db
    .select()
    .from(providerConnections)
    .where(
      and(eq(providerConnections.id, providerId), eq(providerConnections.workspaceId, workspaceId)),
    )
    .limit(1)
  return rows[0] ?? null
}

export async function listProviders(
  db: ProvidersDatabase,
  workspaceId: string,
): Promise<ProviderDto[]> {
  const rows = await db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.workspaceId, workspaceId))
    .orderBy(providerConnections.createdAt)
  return rows.map(serializeProvider)
}

export async function createProvider(
  db: ProvidersDatabase,
  workspaceId: string,
  request: CreateProviderRequest,
): Promise<ProviderDto> {
  const id = randomUUID()
  const inserted = await db
    .insert(providerConnections)
    .values({
      id,
      workspaceId,
      label: request.label,
      kind: request.kind,
      endpointUrl: request.endpointUrl,
      modelId: request.modelId ?? null,
      models: request.models ?? [],
    })
    .returning()
  const row = inserted[0]
  if (!row) throw new Error('Provider insert returned no row')
  return serializeProvider(row)
}

export async function patchProvider(
  db: ProvidersDatabase,
  workspaceId: string,
  providerId: string,
  request: PatchProviderRequest,
): Promise<ProviderDto> {
  const updated = await db
    .update(providerConnections)
    .set({
      ...(request.label !== undefined ? { label: request.label } : {}),
      ...(request.endpointUrl !== undefined ? { endpointUrl: request.endpointUrl } : {}),
      ...(request.modelId !== undefined ? { modelId: request.modelId } : {}),
      ...(request.models !== undefined ? { models: request.models } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(providerConnections.id, providerId),
        eq(providerConnections.workspaceId, workspaceId),
      ),
    )
    .returning()
  const row = updated[0]
  if (!row) throw notFound('Provider not found.')
  return serializeProvider(row)
}

export async function deleteProvider(
  db: ProvidersDatabase,
  workspaceId: string,
  providerId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(providerConnections)
    .where(
      and(
        eq(providerConnections.id, providerId),
        eq(providerConnections.workspaceId, workspaceId),
      ),
    )
    .returning({ id: providerConnections.id })
  return deleted.length > 0
}

/* ------------------------------------------------------------------ */
/* Credentials — encrypted at rest, redacted everywhere               */
/* ------------------------------------------------------------------ */

export async function setCredential(
  db: ProvidersDatabase,
  env: Env,
  workspaceId: string,
  providerId: string,
  apiKey: string,
): Promise<ProviderDto> {
  const provider = await findProvider(db, workspaceId, providerId)
  if (!provider) throw notFound('Provider not found.')

  const masterKey = parseMasterKey(env.CREDENTIAL_MASTER_KEY)
  const envelope: SecretEnvelope = encryptSecret(masterKey, env.CREDENTIAL_KEY_ID, apiKey, {
    workspaceId,
    providerId,
  })

  const updated = await db
    .update(providerConnections)
    .set({
      credentialEnvelope: JSON.stringify(envelope),
      credentialStatus: 'untested',
      credentialLastCheckedAt: null,
      credentialLastError: null,
      updatedAt: new Date(),
    })
    .where(eq(providerConnections.id, providerId))
    .returning()
  const row = updated[0]
  if (!row) throw new Error('Credential update returned no row')
  return serializeProvider(row)
}

export async function deleteCredential(
  db: ProvidersDatabase,
  workspaceId: string,
  providerId: string,
): Promise<ProviderDto> {
  const provider = await findProvider(db, workspaceId, providerId)
  if (!provider) throw notFound('Provider not found.')

  const updated = await db
    .update(providerConnections)
    .set({
      credentialEnvelope: null,
      credentialStatus: 'untested',
      credentialLastCheckedAt: null,
      credentialLastError: null,
      updatedAt: new Date(),
    })
    .where(eq(providerConnections.id, providerId))
    .returning()
  const row = updated[0]
  if (!row) throw new Error('Credential update returned no row')
  return serializeProvider(row)
}

/** Read the decrypted key for server-side use only (never logged, never returned). */
export async function readCredential(
  db: ProvidersDatabase,
  env: Env,
  workspaceId: string,
  providerId: string,
): Promise<string> {
  const provider = await findProvider(db, workspaceId, providerId)
  if (!provider || provider.credentialEnvelope === null) {
    throw badRequest('This provider has no stored credential.')
  }
  const masterKey = parseMasterKey(env.CREDENTIAL_MASTER_KEY)
  const { plaintext } = decryptSecret(masterKey, provider.credentialEnvelope, {
    workspaceId,
    providerId,
  })
  return plaintext
}

/* ------------------------------------------------------------------ */
/* Connection test + model discovery (SSRF-guarded)                    */
/* ------------------------------------------------------------------ */

function modelsUrl(kind: ProviderRow['kind'], endpointUrl: string): string {
  const base = endpointUrl.replace(/\/+$/, '')
  if (kind === 'anthropic') {
    // Anthropic exposes GET /v1/models; OpenAI-compatible servers /models.
    return /\/v1$/.test(base) ? `${base}/models` : `${base}/v1/models`
  }
  return `${base}/models`
}

function authHeaders(kind: ProviderRow['kind'], apiKey: string): Record<string, string> {
  if (kind === 'anthropic') {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      accept: 'application/json',
    }
  }
  return {
    authorization: `Bearer ${apiKey}`,
    accept: 'application/json',
  }
}

/**
 * SSRF-guarded outbound fetch for provider endpoints. DNS resolves and
 * validates against private/link-local/metadata ranges BEFORE the
 * request; redirects are refused (a redirect must not silently bypass
 * the guard); the operator's local-model allowlist applies explicitly.
 */
export async function guardedProviderFetch(
  env: Env,
  url: string,
  init: RequestInit,
  timeoutMs = 10_000,
): Promise<Response> {
  const resolved = await resolveProviderEndpoint(url, {
    allowLocalEndpoints: env.ALLOW_LOCAL_MODEL_ENDPOINTS === 'true',
    allowlist: env.LOCAL_MODEL_ENDPOINT_ALLOWLIST.split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  })

  const request = new Request(resolved.url.toString(), {
    ...init,
    redirect: 'error',
  })
  return (await withTimeout(fetch(request), timeoutMs, 'provider request timeout')) as Response
}

interface ConnectionResult {
  ok: boolean
  message: string
  models: string[] | null
}

async function runConnectionCheck(
  env: Env,
  provider: ProviderRow,
  apiKey: string,
): Promise<ConnectionResult> {
  const url = modelsUrl(provider.kind, provider.endpointUrl)
  try {
    const response = await guardedProviderFetch(env, url, {
      method: 'GET',
      headers: authHeaders(provider.kind, apiKey),
    })

    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: 'The provider rejected the API key.', models: null }
    }
    if (!response.ok) {
      return {
        ok: false,
        message: `The provider endpoint answered ${response.status}.`,
        models: null,
      }
    }

    const body = (await response.json()) as { data?: Array<{ id?: string }> }
    const models = Array.isArray(body.data)
      ? body.data
          .map((entry) => (typeof entry?.id === 'string' ? entry.id : null))
          .filter((id): id is string => id !== null)
          .slice(0, 100)
      : []
    return { ok: true, message: 'Connected — the key works.', models }
  } catch (error) {
    if (error instanceof UrlGuardError) {
      return { ok: false, message: error.message, models: null }
    }
    const message = error instanceof Error ? error.message : 'connection failed'
    return {
      ok: false,
      message: message.includes('timeout')
        ? 'The provider endpoint timed out.'
        : 'The provider endpoint could not be reached.',
      models: null,
    }
  }
}

async function applyTestResult(
  db: ProvidersDatabase,
  workspaceId: string,
  providerId: string,
  result: ConnectionResult,
  persistModels: boolean,
): Promise<ProviderDto> {
  const updated = await db
    .update(providerConnections)
    .set({
      credentialStatus: result.ok ? 'connected' : 'error',
      credentialLastCheckedAt: new Date(),
      credentialLastError: result.ok ? null : result.message,
      ...(persistModels && result.ok && result.models !== null ? { models: result.models } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(providerConnections.id, providerId),
        eq(providerConnections.workspaceId, workspaceId),
      ),
    )
    .returning()
  const row = updated[0]
  if (!row) throw notFound('Provider not found.')
  return serializeProvider(row)
}

export interface ProviderActionResult extends ProviderTestResponse {
  provider: ProviderDto
}

export async function testProviderConnection(
  db: ProvidersDatabase,
  env: Env,
  workspaceId: string,
  providerId: string,
): Promise<ProviderActionResult> {
  const provider = await findProvider(db, workspaceId, providerId)
  if (!provider) throw notFound('Provider not found.')
  if (provider.credentialEnvelope === null) {
    return {
      ok: false,
      message: 'No API key stored for this provider yet.',
      latencyMs: null,
      discoveredModels: null,
      provider: serializeProvider(provider),
    }
  }

  const apiKey = await readCredential(db, env, workspaceId, providerId)
  const startedAt = Date.now()
  const result = await runConnectionCheck(env, provider, apiKey)
  const latencyMs = Date.now() - startedAt
  const providerDto = await applyTestResult(db, workspaceId, providerId, result, false)
  return { ok: result.ok, message: result.message, latencyMs, discoveredModels: result.models, provider: providerDto }
}

export async function discoverProviderModels(
  db: ProvidersDatabase,
  env: Env,
  workspaceId: string,
  providerId: string,
): Promise<ProviderActionResult> {
  const provider = await findProvider(db, workspaceId, providerId)
  if (!provider) throw notFound('Provider not found.')
  if (provider.credentialEnvelope === null) {
    return {
      ok: false,
      message: 'No API key stored for this provider yet.',
      latencyMs: null,
      discoveredModels: null,
      provider: serializeProvider(provider),
    }
  }

  const apiKey = await readCredential(db, env, workspaceId, providerId)
  const startedAt = Date.now()
  const result = await runConnectionCheck(env, provider, apiKey)
  const latencyMs = Date.now() - startedAt
  const providerDto = await applyTestResult(db, workspaceId, providerId, result, true)
  return { ok: result.ok, message: result.message, latencyMs, discoveredModels: result.models, provider: providerDto }
}
