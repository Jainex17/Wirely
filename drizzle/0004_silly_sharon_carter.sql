ALTER TABLE "users" ADD COLUMN "google_api_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "enabled_google_models" jsonb;