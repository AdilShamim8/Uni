CREATE TABLE "job_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"run_id" text,
	"workspace_id" text NOT NULL,
	"session_id" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "job_outbox_sent_idx" ON "job_outbox" USING btree ("sent_at" ASC, "created_at" ASC);--> statement-breakpoint
CREATE INDEX "job_outbox_run_idx" ON "job_outbox" USING btree ("run_id" ASC);
