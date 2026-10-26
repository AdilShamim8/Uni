CREATE TABLE "import_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"checksum" text NOT NULL,
	"source" text DEFAULT 'workspace-backup-v1' NOT NULL,
	"imported_conversations" integer DEFAULT 0 NOT NULL,
	"imported_messages" integer DEFAULT 0 NOT NULL,
	"skipped_temporary" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_id_map" (
	"batch_id" text NOT NULL,
	"kind" text NOT NULL,
	"local_id" text NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "import_id_map_batch_id_kind_local_id_pk" PRIMARY KEY("batch_id","kind","local_id")
);
--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_id_map" ADD CONSTRAINT "import_id_map_batch_id_import_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "import_batch_workspace_checksum_uq" ON "import_batch" USING btree ("workspace_id","checksum");