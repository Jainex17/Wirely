CREATE TYPE "public"."generation_mode" AS ENUM('single_page', 'concept_variants', 'information_architecture');--> statement-breakpoint
CREATE TYPE "public"."generation_output_kind" AS ENUM('page', 'concept');--> statement-breakpoint
CREATE TYPE "public"."generation_output_status" AS ENUM('planned', 'generating', 'repairing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."generation_run_status" AS ENUM('planning', 'planned', 'generating', 'repairing', 'completed', 'partially_completed', 'failed');--> statement-breakpoint
CREATE TABLE "generation_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_run_id" uuid NOT NULL,
	"target_page_id" uuid,
	"output_index" integer NOT NULL,
	"output_kind" "generation_output_kind" NOT NULL,
	"title" text NOT NULL,
	"plan_json" jsonb NOT NULL,
	"critique_json" jsonb,
	"details" text,
	"quality_score" integer,
	"status" "generation_output_status" DEFAULT 'planned' NOT NULL,
	"html_snapshot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"selected_model_name" text NOT NULL,
	"planner_model_name" text NOT NULL,
	"critic_model_name" text NOT NULL,
	"generation_mode" "generation_mode",
	"status" "generation_run_status" DEFAULT 'planning' NOT NULL,
	"stage_status" text DEFAULT 'planning' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_outputs" ADD CONSTRAINT "generation_outputs_generation_run_id_generation_runs_id_fk" FOREIGN KEY ("generation_run_id") REFERENCES "public"."generation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_outputs" ADD CONSTRAINT "generation_outputs_target_page_id_project_pages_id_fk" FOREIGN KEY ("target_page_id") REFERENCES "public"."project_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_outputs_generation_run_id_idx" ON "generation_outputs" USING btree ("generation_run_id");--> statement-breakpoint
CREATE INDEX "generation_outputs_target_page_id_idx" ON "generation_outputs" USING btree ("target_page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_outputs_run_output_index_idx" ON "generation_outputs" USING btree ("generation_run_id","output_index");--> statement-breakpoint
CREATE INDEX "generation_runs_project_id_idx" ON "generation_runs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "generation_runs_project_created_at_idx" ON "generation_runs" USING btree ("project_id","created_at");