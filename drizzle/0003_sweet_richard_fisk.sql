ALTER TABLE "conversation_messages" ADD COLUMN "target_page_id" uuid;--> statement-breakpoint
ALTER TABLE "project_pages" ADD COLUMN "html_content" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_target_page_id_project_pages_id_fk" FOREIGN KEY ("target_page_id") REFERENCES "public"."project_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_messages_target_page_id_idx" ON "conversation_messages" USING btree ("target_page_id");--> statement-breakpoint
CREATE INDEX "project_pages_project_sort_idx" ON "project_pages" USING btree ("project_id","sort_order");