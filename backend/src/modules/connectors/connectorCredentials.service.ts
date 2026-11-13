import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { connectorCredentials } from '../../db/schema.js'
import {
  encryptSecret,
  decryptSecret,
  parseMasterKey,
  type SecretEnvelope,
} from '../../lib/secretBox.js'
import { AppError } from '../../lib/errors.js'

/**
 * P08 / T027 — connector credential storage (GitHub first). Tokens are
 * sealed in secretBox envelopes bound to the workspace + connector
 * scope, exactly like provider and MCP credentials. No function here
 * ever returns the plaintext to a route; routes receive the status
 * shape only (`describeCredential`).
 *
 * The credential master key comes from the same environment pair as
 * every other sealed secret (CREDENTIAL_MASTER_KEY / CREDENTIAL_KEY_ID).
 */

export interface ConnectorCredentialEnv {
  CREDENTIAL_MASTER_KEY?: string
  CREDENTIAL_KEY_ID: string
}

export type ConnectorCredentialStatus = 'untested' | 'verified' | 'invalid'

export type ConnectorsDatabase = NodePgDatabase<typeof schema>

function masterKeyOf(env: ConnectorCredentialEnv): Buffer | null {
  if (!env.CREDENTIAL_MASTER_KEY) return null
  return parseMasterKey(env.CREDENTIAL_MASTER_KEY)
}

/** Store (or replace) the token for a workspace+connector, sealed. */
export async function storeConnectorCredential(
  db: ConnectorsDatabase,
  env: ConnectorCredentialEnv,
  workspaceId: string,
  connectorId: string,
  token: string,
): Promise<void> {
  const masterKey = masterKeyOf(env)
  if (!masterKey) {
    throw new AppError('UNAVAILABLE', 'Credential storage is not configured on this server.', 503)
  }
  const envelope: SecretEnvelope = encryptSecret(masterKey, env.CREDENTIAL_KEY_ID, token, {
    workspaceId,
    providerId: `connector:${connectorId}`,
  })
  const now = new Date()
  await db
    .insert(connectorCredentials)
    .values({
      id: randomUUID(),
      workspaceId,
      connectorId,
      credentialEnvelope: JSON.stringify(envelope),
      status: 'untested',
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [connectorCredentials.workspaceId, connectorCredentials.connectorId],
      set: {
        credentialEnvelope: JSON.stringify(envelope),
        status: 'untested',
        lastError: null,
        updatedAt: now,
      },
    })
}

/** Open the sealed token; null when none is stored. */
export async function openConnectorCredential(
  db: ConnectorsDatabase,
  env: ConnectorCredentialEnv,
  workspaceId: string,
  connectorId: string,
): Promise<string | null> {
  const rows = await db
    .select()
    .from(connectorCredentials)
    .where(
      and(
        eq(connectorCredentials.workspaceId, workspaceId),
        eq(connectorCredentials.connectorId, connectorId),
      ),
    )
    .limit(1)
  const row = rows[0]
  if (!row) return null
  const masterKey = masterKeyOf(env)
  if (!masterKey) {
    throw new AppError('UNAVAILABLE', 'Credential storage is not configured on this server.', 503)
  }
  const { plaintext } = decryptSecret(masterKey, row.credentialEnvelope, {
    workspaceId,
    providerId: `connector:${connectorId}`,
  })
  return plaintext
}

export async function removeConnectorCredential(
  db: ConnectorsDatabase,
  workspaceId: string,
  connectorId: string,
): Promise<boolean> {
  const rows = await db
    .delete(connectorCredentials)
    .where(
      and(
        eq(connectorCredentials.workspaceId, workspaceId),
        eq(connectorCredentials.connectorId, connectorId),
      ),
    )
    .returning({ id: connectorCredentials.id })
  return rows.length > 0
}

/** Record the outcome of a connection test; no-ops when none stored. */
export async function recordCredentialCheck(
  db: ConnectorsDatabase,
  workspaceId: string,
  connectorId: string,
  ok: boolean,
  error?: string,
): Promise<void> {
  await db
    .update(connectorCredentials)
    .set({
      status: ok ? 'verified' : 'invalid',
      lastCheckedAt: new Date(),
      lastError: ok ? null : (error ?? 'Connection test failed.'),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(connectorCredentials.workspaceId, workspaceId),
        eq(connectorCredentials.connectorId, connectorId),
      ),
    )
}

export interface ConnectorCredentialDescriptor {
  connectorId: string
  status: ConnectorCredentialStatus
  lastCheckedAt: number | null
  lastError: string | null
}

/**
 * The route-facing shape: presence + verification state, never the
 * token. Null when no credential is stored.
 */
export async function describeConnectorCredential(
  db: ConnectorsDatabase,
  workspaceId: string,
  connectorId: string,
): Promise<ConnectorCredentialDescriptor | null> {
  const rows = await db
    .select()
    .from(connectorCredentials)
    .where(
      and(
        eq(connectorCredentials.workspaceId, workspaceId),
        eq(connectorCredentials.connectorId, connectorId),
      ),
    )
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return {
    connectorId: row.connectorId,
    status: row.status as ConnectorCredentialStatus,
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.getTime() : null,
    lastError: row.lastError,
  }
}
