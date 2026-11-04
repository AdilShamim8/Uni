CREATE INDEX "run_workspace_created_idx" ON "run" USING btree ("workspace_id" ASC, "created_at" ASC);
