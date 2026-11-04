import { ApiError } from './client'
import { makeId } from '@/domain/ids'

/**
 * N019 — persistent client send identity.
 *
 * One logical user send gets ONE operation id, and that id is reused
 * across EVERY attempt of the same send: the automatic network retries
 * inside a single send, a manual re-press after a failure, and a full
 * page reload (the record lives in localStorage, which survives it).
 * The operation id is the node-create `clientId` AND the run-create
 * `idempotencyKey` (`run-<opId>`) — single-sourced, so the server's
 * idempotency semantics (N016–N018: clientId replay, fingerprint-bound
 * keys, conflict-safe creation) finally protect the real browser send
 * path instead of only direct API callers.
 *
 * Matching rule: a pending record for the same workspace + conversation
 * with the SAME content is the same logical send and reuses its op id.
 * Content differs → the new send supersedes the record. The record is
 * cleared when the client RECEIVES the run-create response (node and
 * run both exist server-side) — a resend after that is a new logical
 * send and must not replay the finished one. Records the client never
 * saw complete survive until superseded or expired (24h), which is
 * exactly the lost-response window idempotency exists for.
 *
 * Storage is a small per-conversation map (latest record per
 * conversation, bounded) — two tabs sending to different conversations
 * never evict each other, and two tabs sending the same text to the
 * same conversation converge on one op id (the server dedupes the
 * concurrent same-clientId posts; that is N018's job).
 */

const STORAGE_KEY = 'uni.pendingServerSend.v1'

/** Pending records older than this are a different logical send. */
const PENDING_SEND_TTL_MS = 24 * 60 * 60 * 1000

/** Bound the map: the newest N conversations keep their records. */
const MAX_PENDING_RECORDS = 8

export interface PendingSendRecord {
  opId: string
  workspaceId: string
  conversationId: string
  content: string
  createdAt: number
}

type SendMap = Record<string, PendingSendRecord>

function mapKey(workspaceId: string, conversationId: string): string {
  return `${workspaceId}:${conversationId}`
}

function readMap(): SendMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const out: SendMap = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue
      const record = value as Partial<PendingSendRecord>
      if (
        typeof record.opId === 'string' &&
        typeof record.workspaceId === 'string' &&
        typeof record.conversationId === 'string' &&
        typeof record.content === 'string' &&
        typeof record.createdAt === 'number'
      ) {
        out[key] = {
          opId: record.opId,
          workspaceId: record.workspaceId,
          conversationId: record.conversationId,
          content: record.content,
          createdAt: record.createdAt,
        }
      }
    }
    return out
  } catch {
    return {}
  }
}

function writeMap(map: SendMap): void {
  try {
    const entries = Object.values(map)
    if (entries.length === 0) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    // Bound the map: drop the oldest records beyond the cap.
    const kept = entries
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_PENDING_RECORDS)
    const bounded: SendMap = {}
    for (const record of kept) bounded[mapKey(record.workspaceId, record.conversationId)] = record
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bounded))
  } catch {
    // Private-browsing/quota failures must never break a send; the
    // identity simply degrades to per-call (pre-N019 behavior).
  }
}

function freshRecord(record: PendingSendRecord): boolean {
  return Date.now() - record.createdAt < PENDING_SEND_TTL_MS
}

/**
 * The operation id for a logical send: the persisted one when this
 * conversation has a fresh pending record with the same content, a
 * newly minted id otherwise (superseding whatever was pending).
 */
export function beginServerSend(workspaceId: string, conversationId: string, content: string): string {
  const key = mapKey(workspaceId, conversationId)
  const map = readMap()
  const pending = map[key]
  if (pending && freshRecord(pending) && pending.content === content) return pending.opId
  const opId = makeId('send')
  map[key] = { opId, workspaceId, conversationId, content, createdAt: Date.now() }
  writeMap(map)
  return opId
}

/**
 * The client saw the run-create response — the logical send exists
 * server-side (node + run). Clear its record only if it is still the
 * pending one (another tab may have superseded it with a newer send).
 */
export function completeServerSend(workspaceId: string, conversationId: string, opId: string): void {
  const key = mapKey(workspaceId, conversationId)
  const map = readMap()
  if (map[key]?.opId === opId) {
    delete map[key]
    writeMap(map)
  }
}

/** Drop pending records (all workspaces, or one) — auth transitions. */
export function clearServerSends(workspaceId?: string): void {
  if (workspaceId === undefined) {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    return
  }
  const map = readMap()
  let changed = false
  for (const [key, record] of Object.entries(map)) {
    if (record.workspaceId === workspaceId) {
      delete map[key]
      changed = true
    }
  }
  if (changed) writeMap(map)
}

/** True for transport-level failures (fetch rejected, no response). */
function isNetworkFailure(error: unknown): boolean {
  return !(error instanceof ApiError)
}

export interface NetworkRetryOptions {
  /** Stop sleeping/retrying when this aborts (sign-out, unmount). */
  signal?: AbortSignal
  /** Total attempts including the first (default 3). */
  attempts?: number
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    if (signal) {
      const onAbort = (): void => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

/**
 * Retry a create call on NETWORK failures only, with the caller's
 * identical inputs (the same op id rides every attempt). An ApiError
 * means the server ANSWERED — a 4xx/409/429 must surface immediately,
 * never auto-retry into the same rejection. Retrying these calls is
 * safe by construction: the node create replays by clientId (N018)
 * and the run create replays by idempotency key + fingerprint
 * (N016/N017) — one node, one run, one provider invocation.
 */
export async function retryOnNetworkFailure<T>(
  fn: () => Promise<T>,
  options: NetworkRetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isNetworkFailure(error)) throw error
      if (attempt === attempts - 1) break
      if (options.signal?.aborted) throw error
      // Small backoff: 400ms, 800ms, … — bounded, no jitter needed at
      // this scale; the abort check above keeps sign-out responsive.
      await sleep(400 * (attempt + 1), options.signal)
    }
  }
  throw lastError
}
