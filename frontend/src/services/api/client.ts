/**
 * Authenticated API client for Uni's server mode.
 *
 * The API base URL comes from VITE_API_BASE_URL — a PUBLIC URL only
 * (never a secret; it is embedded in the browser bundle). Empty/omitted
 * means same-origin: in development the Vite dev server proxies /api and
 * /health to the local backend; in production a reverse proxy serves the
 * frontend and API under one origin.
 *
 * NOTE: the error envelope below intentionally mirrors
 * packages/contracts/src/error.ts (@uni/contracts). The frontend build
 * stays self-contained so the existing Vercel static deployment keeps
 * working; when the single-origin deployment lands (B08), the frontend
 * can import the contracts package directly. Keep both sides in sync —
 * tests assert the shape.
 */

/** Mirror of @uni/contracts errorEnvelopeSchema. */
export interface ApiErrorEnvelope {
  code: string
  message: string
  requestId: string
  details?: unknown
}

/** Error thrown for any non-2xx API response. */
export class ApiError extends Error {
  constructor(
    readonly envelope: ApiErrorEnvelope,
    readonly status: number,
  ) {
    super(envelope.message)
    this.name = 'ApiError'
  }
}

/** Mirror of @uni/contracts API_ROOT. */
export const API_ROOT = '/api/v1'

export function getApiBase(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? ''
  return base.replace(/\/+$/, '')
}

export function apiUrl(path: string): string {
  const base = getApiBase()
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

/**
 * Fetch wrapper for the JSON API: sends/receives JSON, includes
 * credentials (HttpOnly session cookies), and turns every non-2xx
 * response into an ApiError carrying the contract error envelope.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    throw await toApiError(response)
  }

  if (response.status === 204) {
    return undefined as T
  }
  const text = await response.text()
  return (text === '' ? undefined : JSON.parse(text)) as T
}

async function toApiError(response: Response): Promise<ApiError> {
  let envelope: ApiErrorEnvelope
  try {
    const body = (await response.json()) as Record<string, unknown>
    if (typeof body.code === 'string' && typeof body.message === 'string') {
      envelope = {
        code: body.code,
        message: body.message,
        requestId: typeof body.requestId === 'string' ? body.requestId : 'unknown',
        ...(body.details !== undefined ? { details: body.details } : {}),
      }
    } else {
      envelope = unexpectedEnvelope(response.status)
  }
  } catch {
    envelope = unexpectedEnvelope(response.status)
  }
  return new ApiError(envelope, response.status)
}

function unexpectedEnvelope(status: number): ApiErrorEnvelope {
  return {
    code: 'unexpected_response',
    message:
      status >= 500
        ? 'The server responded in an unexpected format.'
        : 'The request could not be completed.',
    requestId: 'unknown',
  }
}
