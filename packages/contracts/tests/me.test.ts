import { describe, expect, it } from 'vitest'
import { meResponseSchema } from '../src/index.js'

/** GET /api/v1/me — the signed-in user plus their resolved workspace. */
describe('me response contract', () => {
  const valid = {
    user: { id: 'usr_1', email: 'alice@example.test', name: 'Alice', createdAt: 1_700_000_000_000 },
    workspace: { id: 'ws_1', name: 'Alice workspace', role: 'owner' },
  }

  it('accepts a well-formed session + workspace pair', () => {
    expect(meResponseSchema.parse(valid)).toEqual(valid)
  })

  it('rejects empty identity fields', () => {
    expect(meResponseSchema.safeParse({ ...valid, user: { ...valid.user, id: '' } }).success).toBe(
      false,
    )
    expect(
      meResponseSchema.safeParse({ ...valid, workspace: { ...valid.workspace, name: '' } })
        .success,
    ).toBe(false)
  })

  it('requires a nonnegative integer createdAt', () => {
    expect(
      meResponseSchema.safeParse({ ...valid, user: { ...valid.user, createdAt: -1 } }).success,
    ).toBe(false)
    expect(
      meResponseSchema.safeParse({ ...valid, user: { ...valid.user, createdAt: 1.5 } }).success,
    ).toBe(false)
  })
})

describe('me workspace role vocabulary', () => {
  const base = {
    user: { id: 'usr_1', email: 'a@b.test', name: 'A', createdAt: 1 },
    workspace: { id: 'ws_1', name: 'W', role: 'owner' },
  }
  it('any non-empty role string is accepted — the vocabulary is the server’s, not the contract’s', () => {
    expect(
      meResponseSchema.safeParse({ ...base, workspace: { ...base.workspace, role: 'member' } })
        .success,
    ).toBe(true)
    expect(
      meResponseSchema.safeParse({
        ...base,
        workspace: { ...base.workspace, role: 'owner:admin' },
      }).success,
    ).toBe(true)
  })
})
