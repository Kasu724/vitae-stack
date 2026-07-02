ALTER TABLE "tailoring_suggestions" ADD COLUMN "decided_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "tailoring_suggestions" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tailoring_suggestions" ADD COLUMN "accepted_version_id" uuid;--> statement-breakpoint
ALTER TABLE "tailoring_suggestions" ADD COLUMN "edited_text_hash" text;--> statement-breakpoint
ALTER TABLE "tailoring_suggestions" ADD CONSTRAINT "tailoring_suggestions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_suggestions" ADD CONSTRAINT "tailoring_suggestions_version_workspace_fk" FOREIGN KEY ("accepted_version_id","workspace_id") REFERENCES "public"."document_versions"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_suggestions" ADD CONSTRAINT "tailoring_suggestions_decision_state" CHECK (("tailoring_suggestions"."status" IN ('pending','blocked') AND "tailoring_suggestions"."decided_at" IS NULL AND "tailoring_suggestions"."decided_by_user_id" IS NULL AND "tailoring_suggestions"."accepted_version_id" IS NULL)
          OR ("tailoring_suggestions"."status" = 'accepted' AND "tailoring_suggestions"."decided_at" IS NOT NULL AND "tailoring_suggestions"."accepted_version_id" IS NOT NULL)
          OR ("tailoring_suggestions"."status" = 'rejected' AND "tailoring_suggestions"."decided_at" IS NOT NULL AND "tailoring_suggestions"."accepted_version_id" IS NULL));--> statement-breakpoint
ALTER TABLE "tailoring_suggestions" ADD CONSTRAINT "tailoring_suggestions_edited_hash" CHECK ("tailoring_suggestions"."edited_text_hash" IS NULL OR "tailoring_suggestions"."edited_text_hash" ~ '^sha256:[0-9a-f]{64}$');
