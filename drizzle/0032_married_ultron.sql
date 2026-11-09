CREATE TABLE "project_page_tabs" (
	"page_id" uuid PRIMARY KEY NOT NULL,
	"tab_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_tabs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_page_tabs" ADD CONSTRAINT "project_page_tabs_page_id_project_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."project_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_page_tabs" ADD CONSTRAINT "project_page_tabs_tab_id_project_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "public"."project_tabs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tabs" ADD CONSTRAINT "project_tabs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_page_tabs_tab_id_idx" ON "project_page_tabs" USING btree ("tab_id");--> statement-breakpoint
CREATE INDEX "project_tabs_project_id_idx" ON "project_tabs" USING btree ("project_id");