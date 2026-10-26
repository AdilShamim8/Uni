CREATE TABLE "provider_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"endpoint_url" text NOT NULL,
	"model_id" text,
	"models" jsonb,
	"credential_envelope" text,
	"credential_status" text DEFAULT 'untested' NOT NULL,
	"credential_last_checked_at" timestamp with time zone,
	"credential_last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_connection" ADD CONSTRAINT "provider_connection_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_connection_workspace_idx" ON "provider_connection" USING btree ("workspace_id","created_at");