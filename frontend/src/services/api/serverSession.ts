import { API_ROOT, apiFetch, ApiError } from './client'

/**
 * Server-session API calls against the backend's Better Auth endpoints
 * (bridged under /api/auth) and the workspace-scoped /api/v1/me route.
 * All requests carry credentials — the session is an HttpOnly cookie the
 * browser never reads directly.
 */

export interface ServerUser {
  id: string
  email: string
  name: string
  createdAt: number
}

export interface ServerWorkspace {
  id: string
  name: string
  role: string
}

export interface ServerAccount {
  user: ServerUser
  workspace: ServerWorkspace
}

interface BetterAuthSessionResponse {
  session?: { token?: string } | null
  user?: {
    id?: string
    email?: string
    name?: string
    createdAt?: string | number | Date
  } | null
}


/** Current session + resolved workspace, or null when signed out. */
export async function fetchServerAccount(): Promise<ServerAccount | null> {
  const session = await apiFetch<BetterAuthSessionResponse | null>('/api/auth/get-session')
  if (!session || !session.user?.id) return null

  const me = await apiFetch<{ user: ServerUser; workspace: ServerWorkspace }>(`${API_ROOT}/me`)
  return { user: me.user, workspace: me.workspace }
}

export async function signInToServer(input: {
  email: string
  password: string
}): Promise<ServerAccount> {
  await apiFetch<{ user?: { id?: string } }>('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const account = await fetchServerAccount()
  if (!account) {
    throw new ApiError(
      { code: 'session_missing', message: 'Signed in, but the session could not be confirmed.', requestId: 'unknown' },
      500,
    )
  }
  return account
}

export async function signUpOnServer(input: {
  name: string
  email: string
  password: string
}): Promise<ServerAccount> {
  await apiFetch<{ user?: { id?: string } }>('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const account = await fetchServerAccount()
  if (!account) {
    throw new ApiError(
      { code: 'session_missing', message: 'Account created, but the session could not be confirmed.', requestId: 'unknown' },
      500,
    )
  }
  return account
}

export async function signOutOfServer(): Promise<void> {
  await apiFetch<{ success?: boolean }>('/api/auth/sign-out', { method: 'POST' })
}
