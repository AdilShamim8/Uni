import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * B01 baseline table: small key/value store for database-level
 * bookkeeping (e.g. marking import batches in later gates). Real domain
 * tables (identity, workspaces, conversations…) land with their gates.
 */
export const dbMetadata = pgTable('db_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type DbMetadataRow = typeof dbMetadata.$inferSelect
export type NewDbMetadataRow = typeof dbMetadata.$inferInsert
