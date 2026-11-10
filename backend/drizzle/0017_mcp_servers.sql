CREATE TABLE "mcp_server" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"auth_type" text DEFAULT 'none' NOT NULL,
	"auth_secret" text,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"last_error" text,
	"server_info" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mcp_server_workspace_idx" ON "mcp_server" USING btree ("workspace_id" ASC, "name" ASC);
