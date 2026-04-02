ALTER TABLE "users" ADD COLUMN "zai_api_key_ciphertext" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "zai_api_key_iv" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "zai_api_key_hmac" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "zai_api_key_key_version" integer;