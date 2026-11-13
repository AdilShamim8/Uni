-- Connector credentials (P08 / T027): one stored token per
-- workspace+connector (GitHub first), sealed in a secretBox envelope.
-- Additive only; the token itself never leaves this table in plaintext
-- and no route ever returns it.
CREATE TABLE "connector_credential" (
  "id" text PRIMARY KEY,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "connector_id" text NOT NULL,
  "credential_envelope" text NOT NULL,
  "status" text NOT NULL DEFAULT 'untested',
  "last_checked_at" timestamptz,
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "connector_credential_workspace_connector_uq"
  ON "connector_credential" ("workspace_id", "connector_id");
