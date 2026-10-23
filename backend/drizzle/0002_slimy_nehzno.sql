CREATE TABLE "conversation_node" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"parent_id" text,
	"role" text NOT NULL,
	"status" text DEFAULT 'complete' NOT NULL,
	"content" text NOT NULL,
	"feedback" text,
	"error" text,
	"status_prefix" text,
	"tools" jsonb,
	"attachments" jsonb,
	"sources" jsonb,
	"client_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"agent_id" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"active_leaf_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_node" ADD CONSTRAINT "conversation_node_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_node_identity_uq" ON "conversation_node" USING btree ("id","conversation_id");--> statement-breakpoint
ALTER TABLE "conversation_node" ADD CONSTRAINT "conversation_node_parent_id_conversation_id_conversation_node_id_conversation_id_fk" FOREIGN KEY ("parent_id","conversation_id") REFERENCES "public"."conversation_node"("id","conversation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_node_client_id_uq" ON "conversation_node" USING btree ("conversation_id","client_id");--> statement-breakpoint
CREATE INDEX "conversation_node_conversation_idx" ON "conversation_node" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_workspace_updated_idx" ON "conversation" USING btree ("workspace_id","updated_at");