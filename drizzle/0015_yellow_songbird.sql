ALTER TABLE "agent_jobs" ADD COLUMN "target_page_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD COLUMN "device_type" text DEFAULT 'desktop' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_target_page_id_project_pages_id_fk" FOREIGN KEY ("target_page_id") REFERENCES "public"."project_pages"("id") ON DELETE cascade ON UPDATE no action;