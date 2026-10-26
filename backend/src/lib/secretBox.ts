import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Versioned authenticated-encryption envelopes for provider credentials.
 *
 * Construction: AES-256-GCM with a unique random 12-byte nonce per
 * encryption, and additional authenticated data binding the ciphertext to
 * its scope (workspace + provider + key id) so an encrypted value cannot
 * be swapped between records undetected.
 *
 * The master key comes from deployment secrets (CREDENTIAL_MASTER_KEY,
 * base64-encoded 32 bytes) — never from the database, never logged, and
 * never returned by any API. Restoring the database without the key
 * cannot recover credentials (documented in backend/README.md).
 */

export const SECRET_ENVELOPE_VERSION = 1
export const SECRET_ALGORITHM = 'aes-256-gcm'
const KEY_ID_MAX_LENGTH = 100

export interface SecretEnvelope {
  v: 1
  alg: 'aes-256-gcm'
  keyId: string
  /** base64url */
  nonce: string
  /** base64url (ciphertext + GCM tag) */
  ct: string
}

export interface SecretScope {
  workspaceId: string
  providerId: string
}

export class SecretKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SecretKeyError'
  }
}

/** Parse and validate a base64 32-byte master key. */
export function parseMasterKey(encoded: string | undefined): Buffer {
  if (!encoded || encoded.trim().length === 0) {
    throw new SecretKeyError(
      'CREDENTIAL_MASTER_KEY must be set (base64-encoded 32 bytes) to store credentials.',
    )
  }
  const key = Buffer.from(encoded.trim(), 'base64')
  if (key.length !== 32) {
    throw new SecretKeyError('CREDENTIAL_MASTER_KEY must decode to exactly 32 bytes.')
  }
  return key
}

function additionalData(scope: SecretScope, keyId: string): Buffer {
  return Buffer.from(`${scope.workspaceId}:${scope.providerId}:${keyId}`, 'utf8')
}

export function encryptSecret(
  masterKey: Buffer,
  keyId: string,
  plaintext: string,
  scope: SecretScope,
): SecretEnvelope {
  if (keyId.length === 0 || keyId.length > KEY_ID_MAX_LENGTH) {
    throw new SecretKeyError('Invalid credential key id.')
  }
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', masterKey, nonce, {
    authTagLength: 16,
  })
  cipher.setAAD(additionalData(scope, keyId))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()])
  return {
    v: SECRET_ENVELOPE_VERSION,
    alg: SECRET_ALGORITHM,
    keyId,
    nonce: nonce.toString('base64url'),
    ct: ciphertext.toString('base64url'),
  }
}

export function decryptSecret(
  masterKey: Buffer,
  envelopeText: string,
  scope: SecretScope,
): { keyId: string; plaintext: string } {
  let envelope: SecretEnvelope
  try {
    envelope = JSON.parse(envelopeText) as SecretEnvelope
  } catch {
    throw new SecretKeyError('Stored credential envelope is malformed.')
  }
  if (envelope.v !== SECRET_ENVELOPE_VERSION || envelope.alg !== SECRET_ALGORITHM) {
    throw new SecretKeyError(`Unsupported credential envelope (v=${String(envelope.v)}).`)
  }
  if (typeof envelope.keyId !== 'string' || typeof envelope.nonce !== 'string' || typeof envelope.ct !== 'string') {
    throw new SecretKeyError('Stored credential envelope is incomplete.')
  }

  const nonce = Buffer.from(envelope.nonce, 'base64url')
  const data = Buffer.from(envelope.ct, 'base64url')
  if (nonce.length !== 12 || data.length < 16) {
    throw new SecretKeyError('Stored credential envelope has invalid lengths.')
  }
  const ciphertext = data.subarray(0, data.length - 16)
  const authTag = data.subarray(data.length - 16)

  const decipher = createDecipheriv('aes-256-gcm', masterKey, nonce, { authTagLength: 16 })
  decipher.setAAD(additionalData(scope, envelope.keyId))
  decipher.setAuthTag(authTag)
  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    return { keyId: envelope.keyId, plaintext }
  } catch {
    // Wrong key, tampered envelope, or wrong scope — never distinguish.
    throw new SecretKeyError('Credential could not be decrypted (wrong key or tampered record).')
  }
}

/** Redacted view of an envelope for API responses — metadata only. */
export function envelopeKeyId(envelopeText: string | null): string | null {
  if (!envelopeText) return null
  try {
    const envelope = JSON.parse(envelopeText) as SecretEnvelope
    return typeof envelope.keyId === 'string' ? envelope.keyId : null
  } catch {
    return null
  }
}
