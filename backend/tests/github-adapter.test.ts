import { describe, expect, it, vi } from 'vitest'
import {
  GITHUB_API_ROOT,
  verifyGithubToken,
  listOpenPullRequests,
  listRecentCommits,
} from '../src/modules/connectors/github.adapter.js'

/**
 * RF-088 — the GitHub adapter is fixture-verified by construction:
 * every function takes `fetch` as its first argument, and these tests
 * drive it with recorded-shape responses. No live network, no
 * fabricated success: every failure path surfaces honestly.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('github adapter (RF-088, fixture-verified)', () => {
  it('verifies a token against /user and returns the login', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe(`${GITHUB_API_ROOT}/user`)
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer ghp_test')
      return jsonResponse(200, { login: 'adilshamim' })
    })
    const result = await verifyGithubToken(fetchMock as unknown as typeof fetch, 'ghp_test')
    expect(result).toEqual({ ok: true, data: { login: 'adilshamim' } })
  })

  it('reports a rejected token honestly (401)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401, { message: 'Bad credentials' }))
    const result = await verifyGithubToken(fetchMock as unknown as typeof fetch, 'ghp_bad')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(401)
      expect(result.error).toContain('401')
    }
  })

  it('reports an unreachable API honestly (network error)', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('connection refused')
    })
    const result = await verifyGithubToken(fetchMock as unknown as typeof fetch, 'ghp_test')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(0)
      expect(result.error).toContain('Could not reach api.github.com')
    }
  })

  it('lists open pull requests with author, state, and link', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain('/repos/uni/uni/pulls?state=open&per_page=20')
      return jsonResponse(200, [
        {
          id: 1,
          number: 42,
          title: 'Fix the scheduler',
          state: 'open',
          html_url: 'https://github.com/uni/uni/pull/42',
          created_at: '2026-11-01T09:00:00Z',
          user: { login: 'contributor' },
        },
      ])
    })
    const result = await listOpenPullRequests(
      fetchMock as unknown as typeof fetch,
      'ghp_test',
      'uni',
      'uni',
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toMatchObject({
        number: 42,
        title: 'Fix the scheduler',
        author: 'contributor',
        state: 'open',
      })
    }
  })

  it('summarizes recent commits with messages and authors', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, [
        {
          sha: 'abc123',
          commit: {
            message: 'Add export tests',
            author: { name: 'Alice', date: '2026-11-10T10:00:00Z' },
          },
        },
      ]),
    )
    const result = await listRecentCommits(
      fetchMock as unknown as typeof fetch,
      'ghp_test',
      'uni',
      'uni',
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data[0]).toMatchObject({
        sha: 'abc123',
        message: 'Add export tests',
        author: 'Alice',
      })
    }
  })

  it('sends the current GitHub API version header on every request', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['X-GitHub-Api-Version']).toBe('2022-11-28')
      return jsonResponse(200, { login: 'whoever' })
    })
    await verifyGithubToken(fetchMock as unknown as typeof fetch, 'ghp_test')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
