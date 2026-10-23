import { pgTable, text, timestamp, boolean, primaryKey, jsonb, index, uniqueIndex, foreignKey } from 'drizzle-orm/pg-core'

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
