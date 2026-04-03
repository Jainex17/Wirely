ALTER TABLE "conversation_messages" ADD COLUMN "selected_model_name" text;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "planner_model_name" text;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "critic_model_name" text;