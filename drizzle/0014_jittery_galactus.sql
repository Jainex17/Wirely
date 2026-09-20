CREATE TYPE "public"."agent_job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "agent_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "agent_job_status" DEFAULT 'queued' NOT NULL,
	"model" text,
	"variant" text,
	"prompt" text NOT NULL,
	"variant_count" integer DEFAULT 1 NOT NULL,
	"result_text" text,
	"error_message" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text DEFAULT 'Local agent' NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_jobs_user_status_idx" ON "agent_jobs" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "agent_jobs_project_id_idx" ON "agent_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "api_tokens_user_id_idx" ON "api_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_tokens_token_hash_idx" ON "api_tokens" USING btree ("token_hash");