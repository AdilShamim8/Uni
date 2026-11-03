ALTER TABLE "provider_connection" ADD COLUMN "auth_mode" text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
/* N001 compat backfill: rows that already carry an encrypted credential
   keep their protocol's keyed transport ('native' for Anthropic's
   x-api-key, 'bearer' for OpenAI-compatible); only genuinely keyless
   rows end up as 'none'. Existing encrypted profiles stay loadable and
   keep sending exactly the headers they sent before this migration. */
UPDATE "provider_connection"
SET "auth_mode" = CASE
  WHEN "credential_envelope" IS NOT NULL THEN CASE
    WHEN "kind" = 'anthropic' THEN 'native'
    ELSE 'bearer'
  END
  ELSE 'none'
END;
