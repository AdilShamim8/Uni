ALTER TABLE "agent_session" ADD COLUMN "employee_id" text;--> statement-breakpoint
CREATE TABLE "agent_turn" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"session_id" text NOT NULL,
	"run_id" text,
	"sequence" integer NOT NULL,
	"message" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "agent_turn" ADD CONSTRAINT "agent_turn_session_id_agent_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "agent_session"("id") ON DELETE cascade ON UPDATE no ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "agent_turn" ADD CONSTRAINT "agent_turn_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "agent_run"("id") ON DELETE cascade ON UPDATE no ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX "agent_turn_session_sequence_idx" ON "agent_turn" USING btree ("session_id" ASC, "sequence" ASC);
