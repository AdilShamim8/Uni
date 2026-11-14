import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  SECRET_ALGORITHM,
  SECRET_ENVELOPE_VERSION,
  SecretKeyError,
  decryptSecret,
  encryptSecret,
  envelopeKeyId,
  parseMasterKey,
} from '../src/lib/secretBox.js'

/**
 * The credential envelope (B03): AES-256-GCM with a unique nonce and
 * scope-bound AAD — an encrypted value cannot be swapped between
 * records undetected, and failures never leak which check failed.
 */
const masterKey = randomBytes(32)
const scope = { workspaceId: 'ws_1', providerId: 'prov_1' }

describe('parseMasterKey', () => {
  it('parses a base64-encoded 32-byte key', () => {
    const encoded = masterKey.toString('base64')
    expect(parseMasterKey(encoded).toString('base64')).toBe(encoded)
  })

  it('rejects missing or blank values', () => {
    expect(() => parseMasterKey(undefined)).toThrow(SecretKeyError)
    expect(() => parseMasterKey('   ')).toThrow(SecretKeyError)
  })

  it('rejects keys that do not decode to exactly 32 bytes', () => {
    expect(() => parseMasterKey(randomBytes(16).toString('base64'))).toThrow(SecretKeyError)
    expect(() => parseMasterKey(randomBytes(33).toString('base64'))).toThrow(SecretKeyError)
  })
})

describe('encryptSecret / decryptSecret', () => {
  it('round-trips the plaintext and key id in a versioned envelope', () => {
    const envelope = encryptSecret(masterKey, 'key_2026', 'sk-live-abc', scope)
    expect(envelope.v).toBe(SECRET_ENVELOPE_VERSION)
    expect(envelope.alg).toBe(SECRET_ALGORITHM)
    expect(envelope.keyId).toBe('key_2026')
    const opened = decryptSecret(masterKey, JSON.stringify(envelope), scope)
    expect(opened).toEqual({ keyId: 'key_2026', plaintext: 'sk-live-abc' })
  })

  it('every encryption uses a fresh nonce', () => {
    const a = encryptSecret(masterKey, 'k', 'same text', scope)
    const b = encryptSecret(masterKey, 'k', 'same text', scope)
    expect(a.nonce).not.toBe(b.nonce)
    expect(a.ct).not.toBe(b.ct)
  })

  it('rejects empty or oversized key ids', () => {
    expect(() => encryptSecret(masterKey, '', 'x', scope)).toThrow(SecretKeyError)
    expect(() => encryptSecret(masterKey, 'k'.repeat(101), 'x', scope)).toThrow(SecretKeyError)
  })

  it('a different master key cannot open the envelope — and the error says nothing about why', () => {
    const envelope = JSON.stringify(encryptSecret(masterKey, 'k', 'sk-live', scope))
    expect(() => decryptSecret(randomBytes(32), envelope, scope)).toThrow(
      'Credential could not be decrypted (wrong key or tampered record).',
    )
  })

  it('the AAD binds the envelope to its scope — a swapped record fails', () => {
    const envelope = JSON.stringify(encryptSecret(masterKey, 'k', 'sk-live', scope))
    expect(() =>
      decryptSecret(masterKey, envelope, { workspaceId: 'ws_other', providerId: 'prov_1' }),
    ).toThrow(SecretKeyError)
    expect(() =>
      decryptSecret(masterKey, envelope, { workspaceId: 'ws_1', providerId: 'prov_other' }),
    ).toThrow(SecretKeyError)
  })

  it('a tampered ciphertext fails authentication', () => {
    const envelope = encryptSecret(masterKey, 'k', 'sk-live', scope)
    const flipped = envelope.ct.slice(0, -2) + (envelope.ct.endsWith('AA') ? 'BB' : 'AA')
    expect(() =>
      decryptSecret(masterKey, JSON.stringify({ ...envelope, ct: flipped }), scope),
    ).toThrow(SecretKeyError)
  })

  it('malformed, unsupported, or incomplete envelopes are rejected honestly', () => {
    expect(() => decryptSecret(masterKey, 'not json', scope)).toThrow(SecretKeyError)
    const v2 = { ...encryptSecret(masterKey, 'k', 'x', scope), v: 2 }
    expect(() => decryptSecret(masterKey, JSON.stringify(v2), scope)).toThrow(/Unsupported/)
    const incomplete = { v: 1, alg: SECRET_ALGORITHM }
    expect(() => decryptSecret(masterKey, JSON.stringify(incomplete), scope)).toThrow(SecretKeyError)
  })
})

describe('envelopeKeyId (the redacted view)', () => {
  it('reads the key id without ever exposing the ciphertext', () => {
    const envelope = JSON.stringify(encryptSecret(masterKey, 'key_2026', 'sk', scope))
    expect(envelopeKeyId(envelope)).toBe('key_2026')
  })

  it('null for missing or garbage envelopes', () => {
    expect(envelopeKeyId(null)).toBeNull()
    expect(envelopeKeyId('garbage')).toBeNull()
  })
})
