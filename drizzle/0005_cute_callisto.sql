ALTER TABLE "users" ADD COLUMN "google_api_key_ciphertext" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_api_key_iv" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_api_key_hmac" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_api_key_key_version" integer;--> statement-breakpoint
UPDATE "users" SET "google_api_key" = NULL WHERE "google_api_key" IS NOT NULL;
UPDATE "users"
SET
  "google_api_key_ciphertext" = NULL,
  "google_api_key_iv" = NULL,
  "google_api_key_hmac" = NULL,
  "google_api_key_key_version" = NULL
WHERE
  "google_api_key_ciphertext" IS NOT NULL
  OR "google_api_key_iv" IS NOT NULL
  OR "google_api_key_hmac" IS NOT NULL
  OR "google_api_key_key_version" IS NOT NULL;
