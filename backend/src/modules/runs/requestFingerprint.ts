import { createHash } from 'node:crypto'

/**
 * Run request fingerprinting (original N016, reopened 2026-11-04).
 *
 * An idempotency key is bound to the CANONICAL EFFECTIVE REQUEST — the
 * four immutable inputs that define what the run does:
 *
 *   1. conversationId — which owned thread the run belongs to
 *   2. parentNodeId   — which user node it answers (server nodes are
 *                       immutable, so the id pins the exact input text)
 *   3. providerId     — which configured provider executes it
 *   4. modelId        — the EFFECTIVE model: the request's explicit
 *                       override, or the provider's default model at
 *                       creation time
 *
 * Same key + same effective request → the one owned run is replayed.
 * Same key + any different effective input → 409 conflict, never a
 * silent replay of an unrelated stored run. The fingerprint never
 * includes credentials (the effective request contains none) and never
 * includes provider config like endpoint/authMode: those are server-side
 * settings the client does not choose, and a run that already executed
 * against the then-current config replays truthfully even if the config
 * was edited afterwards.
 *
 * The object literal below is canonical by construction: JSON.stringify
 * serializes string keys in literal order, so the byte sequence fed to
 * sha256 is stable across processes and versions.
 */

export interface EffectiveRunRequest {
  conversationId: string
  parentNodeId: string
  providerId: string
  /** Effective model — request override or the provider default in force. */
  modelId: string
}

export function computeRunRequestFingerprint(input: EffectiveRunRequest): string {
  const canonical = JSON.stringify({
    conversationId: input.conversationId,
    parentNodeId: input.parentNodeId,
    providerId: input.providerId,
    modelId: input.modelId,
  })
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/** Row shape the fingerprint is derived from (subset of the run row). */
export interface RunRequestFingerprintSource {
  conversationId: string
  parentNodeId: string
  providerId: string | null
  modelId: string
  /** Stored fingerprint; null only for rows created before this column. */
  requestFingerprint: string | null
}

/**
 * The binding of record for an existing run row: the fingerprint stored
 * at creation. Legacy rows (column added by migration 0009; existing rows
 * carry NULL) fall back to derivation from the same four columns the
 * insert wrote, which is byte-identical to what creation would have
 * stored — so in-flight retries against pre-migration runs keep working
 * while changed-input retries still conflict.
 */
export function runRequestFingerprintOf(row: RunRequestFingerprintSource): string {
  if (row.requestFingerprint) return row.requestFingerprint
  return computeRunRequestFingerprint({
    conversationId: row.conversationId,
    parentNodeId: row.parentNodeId,
    providerId: row.providerId ?? '',
    modelId: row.modelId,
  })
}
