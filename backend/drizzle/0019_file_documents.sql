-- Workspace-scoped documents with extracted text (P10, T034).
-- Additive only; retrieval reads extraction='extracted' rows exclusively.
CREATE TABLE "file_document" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"file_name" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"extension" text NOT NULL,
	"mime_type" text DEFAULT 'text/plain' NOT NULL,
	"extraction" text DEFAULT 'pending' NOT NULL,
	"extracted_text" text DEFAULT '' NOT NULL,
	"extraction_error" text,
	"char_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "file_document_workspace_idx" ON "file_document" USING btree ("workspace_id","created_at");
