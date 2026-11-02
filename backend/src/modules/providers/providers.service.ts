import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { providerConnections } from '../../db/schema.js'
import { badRequest, notFound } from '../../lib/errors.js'
import {
  decryptSecret,
  encryptSecret,
  envelopeKeyId,
  parseMasterKey,
  type SecretEnvelope,
} from '../../lib/secretBox.js'
import { createGuardedFetch } from '../../lib/guardedTransport.js'
import { UrlGuardError } from '../../lib/urlGuard.js'
import {
  providerDiscoveryUrl,
  providerAuthHeaders,
  providerRequiresCredential,
  type ProviderProtocol,
} from '../../lib/providerUrls.js'
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
      ...(request.endpointUrl !== undefined
        ? {
            endpointUrl: request.endpointUrl,
            // The verification and discovered catalog belong to the OLD
            // endpoint (U014): editing it resets readiness to untested
            // and drops the stale model list — a deliberate check is
            // required again before the provider claims to work.
            credentialStatus: 'untested',
            credentialLastCheckedAt: null,
            credentialLastError: null,
            models: [],
          }
        : {}),
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

/**
 * URL/header construction is delegated to the shared provider
 * descriptor registry (U011): the protocol's base policy, discovery
 * path, and auth style all come from one place, shared with the
 * generation path and (mirrored until U022) the browser adapters.
 */
function providerProtocol(kind: ProviderRow['kind']): ProviderProtocol {
  // The DB column is a plain string; rows are only written through the
  // validated contract, but an unknown value fails closed here.
  if (kind === 'anthropic' || kind === 'openai-compatible') return kind
  throw new Error(`Unsupported provider protocol: ${kind}`)
}

function modelsUrl(kind: ProviderRow['kind'], endpointUrl: string): string {
  return providerDiscoveryUrl(providerProtocol(kind), endpointUrl)
}

function authHeaders(kind: ProviderRow['kind'], apiKey: string): Record<string, string> {
  return providerAuthHeaders(providerProtocol(kind), apiKey)
}

/**
 * True when the endpoint is OpenRouter. Its /models catalog is PUBLIC —
 * a wrong key still returns 200 with a model list — so a successful models
 * fetch alone cannot claim the key works for OpenRouter.
 */
function isOpenRouterEndpoint(endpointUrl: string): boolean {
  try {
    return new URL(endpointUrl).hostname.toLowerCase() === 'openrouter.ai'
  } catch {
    return false
  }
}

/** OpenRouter's auth-protected key info endpoint. */
function openRouterKeyUrl(endpointUrl: string): string {
  return `${endpointUrl.replace(/\/+$/, '')}/key`
}

/**
 * Hard bound on catalog parsing: a hostile or gigantic endpoint cannot
 * exhaust server memory. Ordering and persistence caps happen AFTER
 * this, so classification (free-first partitioning) is never applied to
 * an already-truncated list.
 */
const MAX_PARSED_MODELS = 2000

/** Hard cap on discovery response bodies (U016). */
const MAX_DISCOVERY_BYTES = 2_000_000
/** The /key verification body is tiny; anything bigger is rejected. */
const MAX_KEY_BODY_BYTES = 64_000

/**
 * Read a response body with a hard byte cap (U016): content-length is
 * checked first, then the stream is read until the limit — an oversized
 * body throws instead of being buffered. The deadline/abort half of the
 * bound already lives in the guarded transport.
 */
async function boundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error('response too large')
  }
  if (!response.body) {
    const text = await response.text()
    if (text.length > maxBytes) throw new Error('response too large')
    return JSON.parse(text)
  }
  const reader = response.body.getReader()
  let received = 0
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value?.byteLength ?? 0
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new Error('response too large')
    }
    if (value) chunks.push(value)
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(merged))
}

/** OpenRouter orders its catalog with the free tier first (zero-cost path). */
function orderOpenRouterModels(models: string[]): string[] {
  const free = models.filter((id) => id.endsWith(':free')).sort((a, b) => a.localeCompare(b))
  const paid = models.filter((id) => !id.endsWith(':free')).sort((a, b) => a.localeCompare(b))
  return [...free, ...paid].slice(0, 100)
}

/**
 * SSRF-guarded outbound fetch for provider endpoints: the shared
 * guarded transport (validation, DNS pinning, redirect refusal, real
 * abort deadlines) wrapped in the signature this module's callers use.
 */
export async function guardedProviderFetch(
  env: Env,
  url: string,
  init: RequestInit,
  timeoutMs = 10_000,
): Promise<Response> {
  const guardedFetch = createGuardedFetch(env, timeoutMs)
  return guardedFetch(url, init)
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

    // Bounded read (U016): a gigantic catalog is rejected by byte cap,
    // never fully buffered.
    const body = (await boundedJson(response, MAX_DISCOVERY_BYTES)) as { data?: Array<{ id?: string }> }
    let models = Array.isArray(body.data)
      ? body.data
          .map((entry) => (typeof entry?.id === 'string' ? entry.id : null))
          .filter((id): id is string => id !== null)
          .slice(0, MAX_PARSED_MODELS)
      : []

    // OpenRouter's /models is public: only the auth-protected /key
    // endpoint can speak for the key. Three distinct outcomes —
    // verified (2xx + valid body), rejected (401/403), unknown
    // (rate-limited, 5xx, network failure, unparseable body) — and
    // only "verified" may claim the connection works. A public catalog
    // is never evidence of a working key.
    if (isOpenRouterEndpoint(provider.endpointUrl)) {
      let verification:
        | { state: 'verified' }
        | { state: 'rejected' }
        | { state: 'unknown'; reason: string }
      try {
        const keyResponse = await guardedProviderFetch(env, openRouterKeyUrl(provider.endpointUrl), {
          method: 'GET',
          headers: authHeaders(provider.kind, apiKey),
        })
        if (keyResponse.status === 401 || keyResponse.status === 403) {
          verification = { state: 'rejected' }
        } else if (!keyResponse.ok) {
          verification = { state: 'unknown', reason: `HTTP ${keyResponse.status}` }
        } else {
          const body = (await boundedJson(keyResponse, MAX_KEY_BODY_BYTES).catch(() => null)) as
            | Record<string, unknown>
            | null
          verification =
            body !== null && typeof body === 'object'
              ? { state: 'verified' }
              : { state: 'unknown', reason: 'unexpected response body' }
        }
      } catch (error) {
        if (error instanceof UrlGuardError) {
          return { ok: false, message: error.message, models: null }
        }
        verification = { state: 'unknown', reason: 'network error' }
      }

      if (verification.state === 'rejected') {
        return {
          ok: false,
          message:
            'OpenRouter answered, but the API key was rejected — check it at openrouter.ai/keys.',
          models: null,
        }
      }
      if (verification.state === 'unknown') {
        return {
          ok: false,
          message: `OpenRouter’s key check is unavailable (${verification.reason}) — the key could not be verified. The model list is public, so reachability alone is not a pass; try again in a moment.`,
          models: null,
        }
      }
      models = orderOpenRouterModels(models)
    } else {
      // Plain providers: deterministic order, capped only AFTER parsing
      // and sorting — the cap is a persistence bound, never a
      // classification-time truncation.
      models = models.slice().sort((a, b) => a.localeCompare(b)).slice(0, 100)
    }

    if (apiKey === '') {
      // Genuinely no-auth connection (local runtime): honest success
      // wording that does not claim a key was verified.
      return { ok: true, message: 'Connected — this endpoint needs no key.', models }
    }
    return { ok: true, message: 'Connected — the key works.', models }
  } catch (error) {
    if (error instanceof UrlGuardError) {
      return { ok: false, message: error.message, models: null }
    }
    if (error instanceof Error && error.message === 'response too large') {
      return {
        ok: false,
        message: `The provider's response was too large (over ${Math.round(MAX_DISCOVERY_BYTES / 1_000_000)} MB) — Uni stopped reading it.`,
        models: null,
      }
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

/** A snapshot of what a check ran against, for staleness fencing (U014). */
interface CheckedConfiguration {
  endpointUrl: string
  credentialEnvelope: string | null
}

async function applyTestResult(
  db: ProvidersDatabase,
  workspaceId: string,
  providerId: string,
  result: ConnectionResult,
  persistModels: boolean,
  checked: CheckedConfiguration,
): Promise<{ provider: ProviderDto; stale: boolean }> {
  // Fence: only apply a check result while the endpoint AND credential
  // are still exactly what the check ran against. An edit that landed
  // mid-check must never be overwritten with the old configuration's
  // readiness (U014).
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
        eq(providerConnections.endpointUrl, checked.endpointUrl),
        sql`${providerConnections.credentialEnvelope} IS NOT DISTINCT FROM ${checked.credentialEnvelope}`,
      ),
    )
    .returning()
  const row = updated[0]
  if (row) return { provider: serializeProvider(row), stale: false }

  // Nothing matched: the configuration changed mid-check. Return the
  // CURRENT row untouched — the stale result is discarded.
  const current = await findProvider(db, workspaceId, providerId)
  if (!current) throw notFound('Provider not found.')
  return { provider: serializeProvider(current), stale: true }
}

/** Honest response when a check result was fenced out by a config edit. */
const STALE_CHECK_MESSAGE =
  'The provider configuration changed while checking — run Test again against the new setup.'

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
  const keyless = provider.credentialEnvelope === null
  if (keyless && providerRequiresCredential(providerProtocol(provider.kind))) {
    return {
      ok: false,
      message: 'No API key stored for this provider yet.',
      latencyMs: null,
      discoveredModels: null,
      provider: serializeProvider(provider),
    }
  }

  const apiKey = keyless ? '' : await readCredential(db, env, workspaceId, providerId)
  const startedAt = Date.now()
  const result = await runConnectionCheck(env, provider, apiKey)
  const latencyMs = Date.now() - startedAt
  const { provider: providerDto, stale } = await applyTestResult(
    db,
    workspaceId,
    providerId,
    result,
    false,
    { endpointUrl: provider.endpointUrl, credentialEnvelope: provider.credentialEnvelope },
  )
  if (stale) {
    return {
      ok: false,
      message: STALE_CHECK_MESSAGE,
      latencyMs,
      discoveredModels: null,
      provider: providerDto,
    }
  }
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
  const keyless = provider.credentialEnvelope === null
  if (keyless && providerRequiresCredential(providerProtocol(provider.kind))) {
    return {
      ok: false,
      message: 'No API key stored for this provider yet.',
      latencyMs: null,
      discoveredModels: null,
      provider: serializeProvider(provider),
    }
  }

  const apiKey = keyless ? '' : await readCredential(db, env, workspaceId, providerId)
  const startedAt = Date.now()
  const result = await runConnectionCheck(env, provider, apiKey)
  const latencyMs = Date.now() - startedAt
  const { provider: providerDto, stale } = await applyTestResult(
    db,
    workspaceId,
    providerId,
    result,
    true,
    { endpointUrl: provider.endpointUrl, credentialEnvelope: provider.credentialEnvelope },
  )
  if (stale) {
    return {
      ok: false,
      message: STALE_CHECK_MESSAGE,
      latencyMs,
      discoveredModels: null,
      provider: providerDto,
    }
  }
  return { ok: result.ok, message: result.message, latencyMs, discoveredModels: result.models, provider: providerDto }
}
