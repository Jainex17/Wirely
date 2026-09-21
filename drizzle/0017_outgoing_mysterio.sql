ALTER TABLE "users" ADD COLUMN "local_model_catalog" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "local_model_catalog_at" timestamp with time zone;