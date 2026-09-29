CREATE TABLE "project_agent_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"page_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_agent_state" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"design_tokens" jsonb,
	"selected_page_id" uuid,
	"selected_node_id" text,
	"selected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_page_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"title" text NOT NULL,
	"html_content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_agent_activity" ADD CONSTRAINT "project_agent_activity_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_agent_state" ADD CONSTRAINT "project_agent_state_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_page_versions" ADD CONSTRAINT "project_page_versions_page_id_project_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."project_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_agent_activity_project_created_idx" ON "project_agent_activity" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "project_page_versions_page_created_idx" ON "project_page_versions" USING btree ("page_id","created_at");