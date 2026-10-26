CREATE TABLE "run_event" (
	"run_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_event_run_id_sequence_pk" PRIMARY KEY("run_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "run" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"parent_node_id" text NOT NULL,
	"provider_id" text,
	"provider_kind" text NOT NULL,
	"provider_endpoint" text NOT NULL,
	"model_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"output_text" text DEFAULT '' NOT NULL,
	"usage" jsonb,
	"idempotency_key" text,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"terminal_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "run_event" ADD CONSTRAINT "run_event_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_provider_id_provider_connection_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_parent_node_id_conversation_id_conversation_node_id_conversation_id_fk" FOREIGN KEY ("parent_node_id","conversation_id") REFERENCES "public"."conversation_node"("id","conversation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_event_run_sequence_idx" ON "run_event" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "run_workspace_idempotency_uq" ON "run" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "run_conversation_idx" ON "run" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "run_status_idx" ON "run" USING btree ("status");