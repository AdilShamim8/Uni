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
  /** T021 — plugin ids enabled for this workspace (the admin gate). */
  enabledPlugins: jsonb('enabled_plugins').$type<string[]>().notNull().default([]),
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
 * returned by any API and never logged. `authMode` is the explicit
 * credential transport (N001): 'none' (genuinely keyless, e.g. local
 * OpenAI-compatible runtimes), 'bearer', or 'native' (protocol-native
 * header). Pre-existing rows were backfilled by the migration: keyed
 * rows kept their protocol's transport, keyless rows became 'none'.
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
    authMode: text('auth_mode').notNull().default('none'),
    endpointUrl: text('endpoint_url').notNull(),
    /**
     * Monotonic config revision (N006): bumped whenever a change
     * invalidates in-flight checks — endpoint, auth mode, or credential
     * changes. A probe captures the revision at start and its result
     * applies only if the revision is unchanged, so a late response can
     * never verify an edited profile.
     */
    configRevision: integer('config_revision').notNull().default(0),
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
    /**
     * sha256 of the canonical effective request the idempotency key is
     * bound to (original N016): conversation + parent node + provider +
     * effective model. NULL only on rows created before migration 0009;
     * replay derives it from the row's own columns in that case.
     */
    requestFingerprint: text('request_fingerprint'),
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
    // N021: creation-rate accounting counts this workspace's rows in the
    // trailing minute (admission transaction) — needs this access path.
    index('run_workspace_created_idx').on(table.workspaceId, table.createdAt),
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

/* ------------------------------------------------------------------ */
/* Employees (B04) — server-side agent profiles                        */
/* ------------------------------------------------------------------ */

/**
 * Workspace-scoped employee (agent) profiles. Mirrors the frontend's
 * AgentProfile shape so a future sync is a projection, not a rewrite.
 * `providerId` is deliberately NOT a foreign key: a pinned preference
 * must survive the provider row being deleted and simply fall back to
 * workspace defaults at send time.
 */
export const employees = pgTable(
  'employee',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    instructions: text('instructions').notNull().default(''),
    category: text('category').notNull().default('personal'),
    providerId: text('provider_id'),
    modelId: text('model_id'),
    tools: jsonb('tools').$type<string[]>(),
    starters: jsonb('starters').$type<string[]>(),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('employee_workspace_updated_idx').on(table.workspaceId, table.updatedAt)],
)

/* ------------------------------------------------------------------ */
/* Employee memory (B04) — notes + audit journal                       */
/* ------------------------------------------------------------------ */

/**
 * One user-authored memory note attached to an employee. `text` is
 * stored exactly as redacted on write (the vendored OpenMausBot
 * redactor strips credential shapes before persistence); entries inside
 * `text` may follow the MEMORY.md grammar (`- YYYY-MM-DD · … · until
 * YYYY-MM-DD`) which the memory block builder respects (expired and
 * superseded entries are hidden from prompts but preserved on disk).
 * `contentHash` is the sha256 of the stored text — the optimistic
 * concurrency token for edits (409 on mismatch, like a file's expected
 * hash upstream).
 */
export const memoryNotes = pgTable(
  'memory_note',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    contentHash: text('content_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('memory_note_employee_updated_idx').on(table.employeeId, table.updatedAt)],
)

/**
 * Append-only audit trail of memory changes — the PostgreSQL port of
 * OpenMausBot's out-of-workspace journal: the audited employee cannot
 * rewrite its own history. `noteId` carries no foreign key ON PURPOSE so
 * journal rows survive note deletion; `before` holds a redacted, capped
 * snapshot enabling revert; `diff` is the vendored unified-diff render.
 * A journal write must never fail the change it records.
 */
export const memoryJournal = pgTable(
  'memory_journal',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    noteId: text('note_id'),
    actor: text('actor').notNull(),
    via: text('via').notNull(),
    kind: text('kind').notNull(),
    beforeHash: text('before_hash'),
    afterHash: text('after_hash'),
    before: text('before'),
    diff: text('diff').notNull(),
    added: integer('added').notNull().default(0),
    removed: integer('removed').notNull().default(0),
    canRevert: boolean('can_revert').notNull().default(true),
    revertUnavailableReason: text('revert_unavailable_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('memory_journal_employee_created_idx').on(table.employeeId, table.createdAt)],
)

/* ------------------------------------------------------------------ */
/* Library (B04) — artifacts with versions                             */
/* ------------------------------------------------------------------ */

/**
 * Canonical Library artifacts. Provenance is snapshotted (kind,
 * generatedBy, source ids as plain text) because referenced rows may be
 * deleted later; history stays truthful about what produced the
 * artifact. `versionCount` is maintained transactionally by the
 * canonical save path.
 */
export const libraryArtifacts = pgTable(
  'library_artifact',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    kind: text('kind').notNull(),
    markdown: text('markdown').notNull(),
    provenance: text('provenance').notNull().default('demo-simulation'),
    generatedBy: jsonb('generated_by'),
    taskId: text('task_id'),
    sourceConversationId: text('source_conversation_id'),
    sourceMessageId: text('source_message_id'),
    versionCount: integer('version_count').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('library_artifact_workspace_updated_idx').on(table.workspaceId, table.updatedAt)],
)

/** Immutable per-save versions; `version` starts at 1 and only grows. */
export const libraryArtifactVersions = pgTable(
  'library_artifact_version',
  {
    id: text('id').primaryKey(),
    artifactId: text('artifact_id')
      .notNull()
      .references(() => libraryArtifacts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    title: text('title').notNull(),
    markdown: text('markdown').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('library_artifact_version_uq').on(table.artifactId, table.version),
    index('library_artifact_version_artifact_idx').on(table.artifactId, table.version),
  ],
)

export type EmployeeRow = typeof employees.$inferSelect
export type NewEmployeeRow = typeof employees.$inferInsert
export type MemoryNoteRow = typeof memoryNotes.$inferSelect
export type NewMemoryNoteRow = typeof memoryNotes.$inferInsert
export type MemoryJournalRow = typeof memoryJournal.$inferSelect
export type NewMemoryJournalRow = typeof memoryJournal.$inferInsert
export type LibraryArtifactRow = typeof libraryArtifacts.$inferSelect
export type NewLibraryArtifactRow = typeof libraryArtifacts.$inferInsert
export type LibraryArtifactVersionRow = typeof libraryArtifactVersions.$inferSelect
export type NewLibraryArtifactVersionRow = typeof libraryArtifactVersions.$inferInsert

/* ------------------------------------------------------------------ */
/* Agent sessions (abacusai-bot port) — server-side agent workspaces   */
/* ------------------------------------------------------------------ */

/**
 * A standing agent session: a mode governing tool approval, an optional
 * soft provider/model pin, a root directory confining file tools, and the
 * roster of enabled tools. `providerId` is deliberately NOT a foreign key
 * (same rule as employees): a pinned preference must survive provider
 * deletion and fall back to workspace defaults at send time.
 */
export const agentSessions = pgTable(
  'agent_session',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    mode: text('mode').notNull().default('default'),
    status: text('status').notNull().default('idle'),
    providerId: text('provider_id'),
    modelId: text('model_id'),
    rootDir: text('root_dir').notNull(),
    tools: jsonb('tools').$type<string[]>(),
    archived: boolean('archived').notNull().default(false),
    /**
     * Optional employee (AI worker profile) this session executes as
     * (T008): instructions and memory come from the linked employee at
     * run time. Soft reference (no FK) like providerId — the pin must
     * survive employee deletion and fail honestly at send time.
     */
    employeeId: text('employee_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('agent_session_workspace_updated_idx').on(table.workspaceId, table.updatedAt),
    index('agent_session_status_idx').on(table.status),
  ],
)

/**
 * One agent run inside a session. Terminal statuses are exactly one of
 * complete/stopped/error; `waiting_for_permission` and `cancelling` are
 * durable transitional states (a crash between ask and answer reconciles
 * honestly). Input/output text is snapshotted for replay.
 */
export const agentRuns = pgTable(
  'agent_run',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => agentSessions.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('running'),
    inputText: text('input_text').notNull(),
    outputText: text('output_text').notNull().default(''),
    providerId: text('provider_id'),
    modelId: text('model_id'),
    idempotencyKey: text('idempotency_key'),
    requestFingerprint: text('request_fingerprint'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    /** Usage summed across the run's model steps (null when the provider reported none). */
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    terminalAt: timestamp('terminal_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('agent_run_workspace_idempotency_uq').on(table.workspaceId, table.idempotencyKey),
    index('agent_run_session_created_idx').on(table.sessionId, table.createdAt),
    index('agent_run_status_idx').on(table.status),
  ],
)

/**
 * Ordered, persisted agent events — the durable stream clients replay on
 * reconnect, sequenced per session (the SSE resume cursor), exactly like
 * run_event. `pendingPermissionId` marks the row a permission ask lives
 * in so the responder can find it transactionally.
 */
export const agentEvents = pgTable(
  'agent_event',
  {
    id: text('id').notNull(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => agentSessions.id, { onDelete: 'cascade' }),
    runId: text('run_id').references(() => agentRuns.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.sequence] }),
    index('agent_event_session_sequence_idx').on(table.sessionId, table.sequence),
    index('agent_event_run_idx').on(table.runId),
  ],
)

/** Session allowances widened by the user's 'always' decisions. */
export const agentAllowances = pgTable(
  'agent_allowance',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => agentSessions.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    value: text('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('agent_allowance_session_kind_value_uq').on(table.sessionId, table.kind, table.value),
    index('agent_allowance_session_idx').on(table.sessionId),
  ],
)

/** The pending permission ask a run is waiting on (or null when none). */
export const agentPendingPermissions = pgTable(
  'agent_pending_permission',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => agentSessions.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    /** The gate's PermissionRequest, verbatim. */
    request: jsonb('request').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolution: text('resolution'),
  },
  (table) => [
    index('agent_pending_permission_session_idx').on(table.sessionId, table.createdAt),
    index('agent_pending_permission_run_idx').on(table.runId),
  ],
)

/* ------------------------------------------------------------------ */
/* Session transcript (F03/T008) — structured ModelMessage persistence */
/* ------------------------------------------------------------------ */

/**
 * One persisted transcript message of a session, in send order: the
 * user's message, the assistant's structured turns (tool-call parts
 * included), and tool results — everything the next run needs to
 * reconstruct prior context via the AI SDK's ModelMessage shapes. The
 * sequence is per-session and monotonic under the same advisory-lock
 * discipline as agent_event.
 */
export const agentTurns = pgTable(
  'agent_turn',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => agentSessions.id, { onDelete: 'cascade' }),
    runId: text('run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    sequence: integer('sequence').notNull(),
    /** The AI SDK ModelMessage, verbatim (role + content parts). */
    message: jsonb('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('agent_turn_session_sequence_idx').on(table.sessionId, table.sequence),
    index('agent_turn_run_idx').on(table.runId),
  ],
)

/* ------------------------------------------------------------------ */
/* Routines (abacusai-bot cron-scheduler port) — scheduled agent runs   */
/* ------------------------------------------------------------------ */

/**
 * A routine: a prompt run on a schedule inside an agent session, in the
 * unattended mode (never asks, allowlisted tools only). `schedule` is a
 * 5-field cron expression evaluated by the minute-tick scheduler;
 * `slots` is the concurrency limiter (upstream: one per session).
 */
export const routines = pgTable(
  'routine',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => agentSessions.id, { onDelete: 'cascade' }),
    /** The employee the routine executes as (soft pin, like sessions). */
    employeeId: text('employee_id'),
    name: text('name').notNull(),
    prompt: text('prompt').notNull(),
    /** 5-field cron expression, UTC. */
    schedule: text('schedule').notNull(),
    /** Minutes a missed fire may be caught up after downtime (0 = skip). */
    catchUpMinutes: integer('catch_up_minutes').notNull().default(0),
    paused: boolean('paused').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
    lastFireAt: timestamp('last_fire_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('routine_workspace_idx').on(table.workspaceId, table.createdAt),
    index('routine_session_idx').on(table.sessionId),
    index('routine_paused_idx').on(table.paused, table.archived),
  ],
)

/**
 * A workspace-scoped document with extracted text (P10, T034): the
 * knowledge-retrieval source of truth. Extraction is honest —
 * 'unsupported'/'failed' rows keep their bytes but never count toward
 * retrieval.
 */
export const fileDocuments = pgTable(
  'file_document',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    fileName: text('file_name').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    extension: text('extension').notNull(),
    mimeType: text('mime_type').notNull().default('text/plain'),
    extraction: text('extraction').notNull().default('pending'),
    extractedText: text('extracted_text').notNull().default(''),
    extractionError: text('extraction_error'),
    charCount: integer('char_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('file_document_workspace_idx').on(table.workspaceId, table.createdAt)],
)

/**
 * One fire of a routine. `slotClaimedAt` is the advisory-lock-guarded
 * claim (only one process may run a given routine at a time); terminal
 * statuses match agent runs.
 */
export const routineRuns = pgTable(
  'routine_run',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    routineId: text('routine_id')
      .notNull()
      .references(() => routines.id, { onDelete: 'cascade' }),
    /** Which scheduled minute this fire belongs to (UTC, truncated). */
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('pending'),
    agentRunId: text('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    outputText: text('output_text').notNull().default(''),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    slotClaimedAt: timestamp('slot_claimed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    terminalAt: timestamp('terminal_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('routine_run_routine_scheduled_uq').on(table.routineId, table.scheduledFor),
    index('routine_run_status_idx').on(table.status),
    index('routine_run_created_idx').on(table.routineId, table.createdAt),
  ],
)

export type AgentSessionRow = typeof agentSessions.$inferSelect
export type NewAgentSessionRow = typeof agentSessions.$inferInsert
export type AgentRunRow = typeof agentRuns.$inferSelect
export type NewAgentRunRow = typeof agentRuns.$inferInsert
export type AgentEventRow = typeof agentEvents.$inferSelect
export type NewAgentEventRow = typeof agentEvents.$inferInsert
export type AgentAllowanceRow = typeof agentAllowances.$inferSelect
export type NewAgentAllowanceRow = typeof agentAllowances.$inferInsert
export type AgentPendingPermissionRow = typeof agentPendingPermissions.$inferSelect
export type NewAgentPendingPermissionRow = typeof agentPendingPermissions.$inferInsert
export type AgentTurnRow = typeof agentTurns.$inferSelect
export type NewAgentTurnRow = typeof agentTurns.$inferInsert

/* ------------------------------------------------------------------ */
/* Durable jobs (T013) — outbox closing the run-row/queue gap          */
/* ------------------------------------------------------------------ */

/**
 * The transactional outbox: rows committed in the SAME transaction as
 * their application row (the run), then dispatched to pg-boss and
 * marked sent. A crash between commit and dispatch leaves the row
 * unsent — the reconciler re-sends it — and a crash between send and
 * mark-sent is safe because the queue entry is singleton-keyed by run
 * id. Payloads carry ONLY identifiers, never credentials.
 */
export const jobOutbox = pgTable(
  'job_outbox',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    runId: text('run_id'),
    workspaceId: text('workspace_id').notNull(),
    sessionId: text('session_id'),
    /** JobPayload as JSON — identifiers only. */
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [
    index('job_outbox_sent_idx').on(table.sentAt, table.createdAt),
    index('job_outbox_run_idx').on(table.runId),
  ],
)
export type JobOutboxRow = typeof jobOutbox.$inferSelect
export type NewJobOutboxRow = typeof jobOutbox.$inferInsert

/* ------------------------------------------------------------------ */
/* Work (T018) — durable tasks + revision runs + receipts              */
/* ------------------------------------------------------------------ */

/**
 * A durable Work task: a goal delegated to an employee, executed as
 * agent runs inside a session, producing a canonical Library artifact.
 * Status mirrors the frontend task machine; employeeId/sessionId are
 * soft pins (like the agent session's own pins) so a deleted employee
 * or session leaves the task intact and honestly re-assignable.
 */
export const workTasks = pgTable(
  'work_task',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    goal: text('goal').notNull().default(''),
    deliverable: text('deliverable').notNull().default('generic'),
    status: text('status').notNull().default('draft'),
    employeeId: text('employee_id'),
    sessionId: text('session_id'),
    activeRunId: text('active_run_id'),
    artifactId: text('artifact_id'),
    statusLabel: text('status_label').notNull().default('Draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('work_task_workspace_updated_idx').on(table.workspaceId, table.updatedAt),
    index('work_task_status_idx').on(table.status),
  ],
)

/**
 * One durable execution attempt: the agent run it delegated to, the
 * revision number (follow-ups are 2+), and how it ended. Receipts
 * (T020) persist the sources/tools/provenance that actually happened.
 */
export const workRuns = pgTable(
  'work_run',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    taskId: text('task_id')
      .notNull()
      .references(() => workTasks.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    agentRunId: text('agent_run_id').notNull(),
    status: text('status').notNull().default('running'),
    outcome: text('outcome'),
    /** WorkRunReceipts as JSON — bounded, secret-free. */
    receipts: jsonb('receipts'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    index('work_run_task_idx').on(table.taskId, table.revision),
    uniqueIndex('work_run_agent_run_uq').on(table.agentRunId),
  ],
)
export type WorkTaskRow = typeof workTasks.$inferSelect
export type NewWorkTaskRow = typeof workTasks.$inferInsert
export type WorkRunRow = typeof workRuns.$inferSelect
export type NewWorkRunRow = typeof workRuns.$inferInsert

/* ------------------------------------------------------------------ */
/* Plugins (T021) — grants + receipts                                  */
/* ------------------------------------------------------------------ */

/**
 * A per-thread grant: permission to use ONE plugin in ONE thread.
 * Workspace enablement lives on the workspace row's enabledPlugins
 * (the administrator gate); this is the user's per-thread gate.
 */
export const pluginGrants = pgTable(
  'plugin_grant',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    pluginId: text('plugin_id').notNull(),
    kind: text('kind').notNull(),
    threadId: text('thread_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('plugin_grant_unique_idx').on(table.workspaceId, table.pluginId, table.kind, table.threadId),
    index('plugin_grant_thread_idx').on(table.workspaceId, table.threadId),
  ],
)

/** One execution receipt per plugin invocation (T021). */
export const pluginReceipts = pgTable(
  'plugin_receipt',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    pluginId: text('plugin_id').notNull(),
    capability: text('capability').notNull(),
    kind: text('kind').notNull(),
    threadId: text('thread_id').notNull(),
    runId: text('run_id'),
    status: text('status').notNull(),
    detail: text('detail').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('plugin_receipt_thread_idx').on(table.workspaceId, table.threadId, table.createdAt),
  ],
)
export type RoutineRow = typeof routines.$inferSelect
export type NewRoutineRow = typeof routines.$inferInsert
export type RoutineRunRow = typeof routineRuns.$inferSelect
export type NewRoutineRunRow = typeof routineRuns.$inferInsert

/* ------------------------------------------------------------------ */
/* MCP servers (T023) — workspace-scoped remote tool providers         */
/* ------------------------------------------------------------------ */

/**
 * A configured external MCP server. The bearer token (when present) is
 * stored in the encrypted secret envelope — never in plain columns,
 * never in API responses. Status reflects the last connect/test
 * honestly. Tools are listed live from the remote (T024); nothing is
 * cached beyond the last serverInfo.
 */
export const mcpServers = pgTable(
  'mcp_server',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    /** 'none' | 'bearer'. */
    authType: text('auth_type').notNull().default('none'),
    /** secretBox envelope JSON for the bearer token; null when none. */
    authSecret: text('auth_secret'),
    status: text('status').notNull().default('disconnected'),
    lastError: text('last_error'),
    /** { name, version } from the last successful connect; null otherwise. */
    serverInfo: jsonb('server_info'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('mcp_server_workspace_idx').on(table.workspaceId, table.name)],
)
export type McpServerRow = typeof mcpServers.$inferSelect
export type NewMcpServerRow = typeof mcpServers.$inferInsert
