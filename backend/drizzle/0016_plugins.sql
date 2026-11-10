CREATE TABLE "plugin_grant" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE cascade,
	"plugin_id" text NOT NULL,
	"kind" text NOT NULL,
	"thread_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_grant_unique_idx" ON "plugin_grant" USING btree ("workspace_id" ASC, "plugin_id" ASC, "kind" ASC, "thread_id" ASC);--> statement-breakpoint
CREATE INDEX "plugin_grant_thread_idx" ON "plugin_grant" USING btree ("workspace_id" ASC, "thread_id" ASC);--> statement-breakpoint
CREATE TABLE "plugin_receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE cascade,
	"plugin_id" text NOT NULL,
	"capability" text NOT NULL,
	"kind" text NOT NULL,
	"thread_id" text NOT NULL,
	"run_id" text,
	"status" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "plugin_receipt_thread_idx" ON "plugin_receipt" USING btree ("workspace_id" ASC, "thread_id" ASC, "created_at" ASC);--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "enabled_plugins" jsonb DEFAULT '[]'::jsonb NOT NULL;
