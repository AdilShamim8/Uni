import { pgTable, text, timestamp, boolean, primaryKey, jsonb, index, uniqueIndex, foreignKey, integer } from 'drizzle-orm/pg-core'

/* ------------------------------------------------------------------ */
/* Better Auth core tables (user/session/account/verification)         */
/* Field names follow the Better Auth drizzle adapter contract.        */
/* ------------------------------------------------------------------ */

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/* ------------------------------------------------------------------ */
/* Workspaces and membership                                           */
/* ------------------------------------------------------------------ */

export const workspaces = pgTable('workspace', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const workspaceMembers = pgTable(
  'workspace_member',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.userId] })],
)

/* ------------------------------------------------------------------ */
/* Conversations and message-tree nodes (B02)                          */
/* ------------------------------------------------------------------ */

/**
 * Conversations are workspace-scoped. `activeLeafId` selects the active
 * branch; it is validated against this conversation's nodes in the
 * service layer within the same transaction (a DB-level FK would be
 * circular with conversation_node's cascade).
 */
export const conversations = pgTable(
  'conversation',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    agentId: text('agent_id'),
    pinned: boolean('pinned').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
    activeLeafId: text('active_leaf_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('conversation_workspace_updated_idx').on(table.workspaceId, table.updatedAt)],
)

/**
 * Message-tree nodes. The composite unique (id, conversation_id) plus the
 * composite foreign key (parent_id, conversation_id) → (id, conversation_id)
 * enforce at the DATABASE level that a node's parent belongs to the same
 * conversation — branches can never cross conversations, and cycles are
 * impossible because parents must already exist.
 */
export const conversationNodes = pgTable(
  'conversation_node',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    role: text('role').notNull(),
    status: text('status').notNull().default('complete'),
    content: text('content').notNull(),
    feedback: text('feedback'),
    error: text('error'),
    statusPrefix: text('status_prefix'),
    tools: jsonb('tools'),
    attachments: jsonb('attachments'),
    sources: jsonb('sources'),
    clientId: text('client_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('conversation_node_identity_uq').on(table.id, table.conversationId),
    // One node per client idempotency key within a conversation.
    uniqueIndex('conversation_node_client_id_uq').on(table.conversationId, table.clientId),
    // A parent must belong to the same conversation (same-row composite FK).
    foreignKey({
      columns: [table.parentId, table.conversationId],
      foreignColumns: [table.id, table.conversationId],
    }),
    index('conversation_node_conversation_idx').on(table.conversationId, table.createdAt),
  ],
)

/* ------------------------------------------------------------------ */
/* Provider connections (B03)                                          */
/* ------------------------------------------------------------------ */

/**
 * Workspace-scoped provider connections. `credentialEnvelope` holds the
 * AES-256-GCM secret envelope (see lib/secretBox.ts) — it is never
 * returned by any API and never logged.
 */
export const providerConnections = pgTable(
  'provider_connection',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    kind: text('kind').notNull(),
    endpointUrl: text('endpoint_url').notNull(),
    modelId: text('model_id'),
    models: jsonb('models').$type<string[]>(),
    credentialEnvelope: text('credential_envelope'),
    credentialStatus: text('credential_status').notNull().default('untested'),
    credentialLastCheckedAt: timestamp('credential_last_checked_at', { withTimezone: true }),
    credentialLastError: text('credential_last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('provider_connection_workspace_idx').on(table.workspaceId, table.createdAt)],
)

/* ------------------------------------------------------------------ */
/* Deliberate import batches (B02)                                     */
/* ------------------------------------------------------------------ */

/**
 * One row per successfully applied backup import. The unique
 * (workspace_id, checksum) makes re-importing the identical backup a
 * no-op replay instead of duplicated records.
 */
export const importBatches = pgTable(
  'import_batch',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    checksum: text('checksum').notNull(),
    source: text('source').notNull().default('workspace-backup-v1'),
    importedConversations: integer('imported_conversations').notNull().default(0),
    importedMessages: integer('imported_messages').notNull().default(0),
    skippedTemporary: integer('skipped_temporary').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('import_batch_workspace_checksum_uq').on(table.workspaceId, table.checksum)],
)

/** Old (local) ID to new (server) ID mapping per import, for reporting. */
export const importIdMap = pgTable(
  'import_id_map',
  {
    batchId: text('batch_id')
      .notNull()
      .references(() => importBatches.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    localId: text('local_id').notNull(),
    serverId: text('server_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.batchId, table.kind, table.localId] })],
)

/* ------------------------------------------------------------------ */
/* B01 baseline table                                                  */
/* ------------------------------------------------------------------ */

export const dbMetadata = pgTable('db_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type DbMetadataRow = typeof dbMetadata.$inferSelect
export type NewDbMetadataRow = typeof dbMetadata.$inferInsert
export type UserRow = typeof user.$inferSelect
export type WorkspaceRow = typeof workspaces.$inferSelect
export type WorkspaceMemberRow = typeof workspaceMembers.$inferSelect

/* ------------------------------------------------------------------ */
/* Chat runs + events (B03)                                            */
/* ------------------------------------------------------------------ */

/**
 * One model execution answering a user node in a conversation.
 *
 * Terminal statuses are exactly one of `complete`, `stopped`,
 * `repetition_stopped`, or `error` — a provider failure or guard stop is
 * never recorded as complete. `cancelling` is a durable transitional
 * state: cancel writes it before aborting the in-process call, so a
 * crash between request and abort still reconciles honestly.
 *
 * Provider provenance is snapshotted (kind/endpoint/model) because the
 * referenced provider row may be deleted later; history stays truthful
 * about what actually produced the output.
 */
export const runs = pgTable(
  'run',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    parentNodeId: text('parent_node_id').notNull(),
    providerId: text('provider_id').references(() => providerConnections.id, {
      onDelete: 'set null',
    }),
    providerKind: text('provider_kind').notNull(),
    providerEndpoint: text('provider_endpoint').notNull(),
    modelId: text('model_id').notNull(),
    status: text('status').notNull().default('running'),
    outputText: text('output_text').notNull().default(''),
    usage: jsonb('usage'),
    idempotencyKey: text('idempotency_key'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    terminalAt: timestamp('terminal_at', { withTimezone: true }),
  },
  (table) => [
    // Idempotent run creation per workspace (same key returns the same run).
    uniqueIndex('run_workspace_idempotency_uq').on(table.workspaceId, table.idempotencyKey),
    index('run_conversation_idx').on(table.conversationId, table.createdAt),
    // Stuck-run reconciliation scans non-terminal runs.
    index('run_status_idx').on(table.status),
    // The answered node must belong to the same conversation.
    foreignKey({
      columns: [table.parentNodeId, table.conversationId],
      foreignColumns: [conversationNodes.id, conversationNodes.conversationId],
    }),
  ],
)

/**
 * Ordered, persisted run events — the durable stream clients replay on
 * reconnect instead of regenerating output. Sequences are per-run and
 * monotonic; `delta` payloads carry exact text so replayed runs produce
 * byte-identical transcripts.
 */
export const runEvents = pgTable(
  'run_event',
  {
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.sequence] }),
    index('run_event_run_sequence_idx').on(table.runId, table.sequence),
  ],
)

export type RunRow = typeof runs.$inferSelect
export type NewRunRow = typeof runs.$inferInsert
export type RunEventRow = typeof runEvents.$inferSelect
export type NewRunEventRow = typeof runEvents.$inferInsert
