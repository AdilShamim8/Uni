CREATE TABLE "employee" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'personal' NOT NULL,
	"provider_id" text,
	"model_id" text,
	"tools" jsonb,
	"starters" jsonb,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_artifact_version" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"markdown" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_artifact" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"markdown" text NOT NULL,
	"provenance" text DEFAULT 'demo-simulation' NOT NULL,
	"generated_by" jsonb,
	"task_id" text,
	"source_conversation_id" text,
	"source_message_id" text,
	"version_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_journal" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"note_id" text,
	"actor" text NOT NULL,
	"via" text NOT NULL,
	"kind" text NOT NULL,
	"before_hash" text,
	"after_hash" text,
	"before" text,
	"diff" text NOT NULL,
	"added" integer DEFAULT 0 NOT NULL,
	"removed" integer DEFAULT 0 NOT NULL,
	"can_revert" boolean DEFAULT true NOT NULL,
	"revert_unavailable_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_note" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"text" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_artifact_version" ADD CONSTRAINT "library_artifact_version_artifact_id_library_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."library_artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_artifact" ADD CONSTRAINT "library_artifact_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_journal" ADD CONSTRAINT "memory_journal_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_journal" ADD CONSTRAINT "memory_journal_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_note" ADD CONSTRAINT "memory_note_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_note" ADD CONSTRAINT "memory_note_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_workspace_updated_idx" ON "employee" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "library_artifact_version_uq" ON "library_artifact_version" USING btree ("artifact_id","version");--> statement-breakpoint
CREATE INDEX "library_artifact_version_artifact_idx" ON "library_artifact_version" USING btree ("artifact_id","version");--> statement-breakpoint
CREATE INDEX "library_artifact_workspace_updated_idx" ON "library_artifact" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "memory_journal_employee_created_idx" ON "memory_journal" USING btree ("employee_id","created_at");--> statement-breakpoint
CREATE INDEX "memory_note_employee_updated_idx" ON "memory_note" USING btree ("employee_id","updated_at");