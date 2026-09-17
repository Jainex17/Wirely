CREATE TABLE "project_prototype_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"page_ids" jsonb NOT NULL,
	"start_page_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_pages" ADD COLUMN "device_type" text DEFAULT 'desktop' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_prototype_flows" ADD CONSTRAINT "project_prototype_flows_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_prototype_flows" ADD CONSTRAINT "project_prototype_flows_start_page_id_project_pages_id_fk" FOREIGN KEY ("start_page_id") REFERENCES "public"."project_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_prototype_flows_project_id_idx" ON "project_prototype_flows" USING btree ("project_id");