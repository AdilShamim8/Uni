/**
 * P08 / T027 — the GitHub adapter, fixture-verified by design: every
 * function takes the `fetch` implementation as its first argument, so
 * tests drive it with recorded responses while production passes the
 * global fetch. The adapter talks to the public REST API with a stored
 * PAT and NEVER fabricates data — an HTTP failure surfaces as an
 * honest error result.
 *
 * Scope (v1): verify a token (GET /user), list a repository's open
 * pull requests (GET /repos/:owner/:repo/pulls), and summarize recent
 * commits (GET /repos/:owner/:repo/commits). Read-only by design.
 */

export const GITHUB_API_ROOT = 'https://api.github.com'

export interface GithubPullRequest {
  id: number
  number: number
  title: string
  author: string
  /** 'open' | 'closed' — as GitHub reports it. */
  state: string
  htmlUrl: string
  createdAt: string
}

export interface GithubCommit {
  sha: string
  message: string
  author: string
  committedAt: string
}

export type GithubAdapterResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

type FetchLike = typeof fetch

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function request(
  fetchImpl: FetchLike,
  token: string,
  path: string,
): Promise<{ ok: true; body: unknown } | { ok: false; status: number; error: string }> {
  let response: Response
  try {
    response = await fetchImpl(`${GITHUB_API_ROOT}${path}`, { headers: headers(token) })
  } catch (cause) {
    return {
      ok: false,
      status: 0,
      error: `Could not reach api.github.com: ${cause instanceof Error ? cause.message : 'network error'}`,
    }
  }
  if (!response.ok) {
    return { ok: false, status: response.status, error: `GitHub responded ${response.status}.` }
  }
  return { ok: true, body: await response.json() }
}

/** Verify a token by asking GitHub who it belongs to. */
export async function verifyGithubToken(
  fetchImpl: FetchLike,
  token: string,
): Promise<GithubAdapterResult<{ login: string }>> {
  const result = await request(fetchImpl, token, '/user')
  if (!result.ok) return result
  const body = result.body as { login?: string }
  if (!body.login) {
    return { ok: false, status: 502, error: 'GitHub returned no login for this token.' }
  }
  return { ok: true, data: { login: body.login } }
}

/** List a repository's open pull requests (first page, read-only). */
export async function listOpenPullRequests(
  fetchImpl: FetchLike,
  token: string,
  owner: string,
  repo: string,
): Promise<GithubAdapterResult<GithubPullRequest[]>> {
  const result = await request(
    fetchImpl,
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=20`,
  )
  if (!result.ok) return result
  const pulls = result.body as Array<{
    id: number
    number: number
    title: string
    state: string
    html_url: string
    created_at: string
    user?: { login?: string }
  }>
  return {
    ok: true,
    data: pulls.map((pull) => ({
      id: pull.id,
      number: pull.number,
      title: pull.title,
      author: pull.user?.login ?? 'unknown',
      state: pull.state,
      htmlUrl: pull.html_url,
      createdAt: pull.created_at,
    })),
  }
}

/** Recent commits on a repository's default branch (first page). */
export async function listRecentCommits(
  fetchImpl: FetchLike,
  token: string,
  owner: string,
  repo: string,
): Promise<GithubAdapterResult<GithubCommit[]>> {
  const result = await request(
    fetchImpl,
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=15`,
  )
  if (!result.ok) return result
  const commits = result.body as Array<{
    sha: string
    commit?: { message?: string; author?: { name?: string; date?: string } }
  }>
  return {
    ok: true,
    data: commits.map((entry) => ({
      sha: entry.sha,
      message: entry.commit?.message ?? '',
      author: entry.commit?.author?.name ?? 'unknown',
      committedAt: entry.commit?.author?.date ?? '',
    })),
  }
}
