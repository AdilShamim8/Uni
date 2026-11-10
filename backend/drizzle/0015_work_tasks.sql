CREATE TABLE "work_task" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE cascade,
	"title" text NOT NULL,
	"goal" text DEFAULT '' NOT NULL,
	"deliverable" text DEFAULT 'generic' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"employee_id" text,
	"session_id" text,
	"active_run_id" text,
	"artifact_id" text,
	"status_label" text DEFAULT 'Draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "work_task_workspace_updated_idx" ON "work_task" USING btree ("workspace_id" ASC, "updated_at" ASC);--> statement-breakpoint
CREATE INDEX "work_task_status_idx" ON "work_task" USING btree ("status" ASC);--> statement-breakpoint
CREATE TABLE "work_run" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE cascade,
	"task_id" text NOT NULL REFERENCES "work_task"("id") ON DELETE cascade,
	"revision" integer NOT NULL,
	"agent_run_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"outcome" text,
	"receipts" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "work_run_task_idx" ON "work_run" USING btree ("task_id" ASC, "revision" ASC);--> statement-breakpoint
CREATE UNIQUE INDEX "work_run_agent_run_uq" ON "work_run" USING btree ("agent_run_id" ASC);
