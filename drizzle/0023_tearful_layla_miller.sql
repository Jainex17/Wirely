CREATE TABLE "project_page_agent_baselines" (
	"page_id" uuid PRIMARY KEY NOT NULL,
	"html_content" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_page_agent_baselines" ADD CONSTRAINT "project_page_agent_baselines_page_id_project_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."project_pages"("id") ON DELETE cascade ON UPDATE no action;