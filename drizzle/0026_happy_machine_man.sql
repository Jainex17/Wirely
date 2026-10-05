CREATE TYPE "public"."project_kind" AS ENUM('html', 'design');--> statement-breakpoint
CREATE TABLE "project_documents" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"data" "bytea" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "kind" "project_kind" DEFAULT 'html' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;