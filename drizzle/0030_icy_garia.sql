CREATE TABLE "project_memory" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"context" text DEFAULT '' NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_memory" ADD CONSTRAINT "project_memory_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;