CREATE TYPE "public"."extraction_batch_status" AS ENUM('pending', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."extraction_method" AS ENUM('deterministic', 'ai');--> statement-breakpoint
CREATE TABLE "extraction_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_document_id" uuid NOT NULL,
	"target_career_entry_id" uuid,
	"method" "extraction_method" NOT NULL,
	"task_version" text NOT NULL,
	"status" "extraction_batch_status" DEFAULT 'pending' NOT NULL,
	"created_by_user_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"source_document_id" uuid NOT NULL,
	"target_career_entry_id" uuid,
	"proposed_entry_type" "career_entry_type" NOT NULL,
	"proposed_entry_title" text NOT NULL,
	"fact_type" "evidence_fact_type" NOT NULL,
	"proposed_value" jsonb NOT NULL,
	"display_text" text NOT NULL,
	"source_locator" jsonb NOT NULL,
	"status" "fact_proposal_status" DEFAULT 'pending' NOT NULL,
	"duplicate_of_fact_id" uuid,
	"approved_fact_id" uuid,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extraction_proposals_value_object" CHECK (jsonb_typeof("extraction_proposals"."proposed_value") = 'object'),
	CONSTRAINT "extraction_proposals_locator_object" CHECK (jsonb_typeof("extraction_proposals"."source_locator") = 'object'),
	CONSTRAINT "extraction_proposals_revision_positive" CHECK ("extraction_proposals"."revision" > 0),
	CONSTRAINT "extraction_proposals_resolution_pair" CHECK (("extraction_proposals"."resolved_at" IS NULL) = ("extraction_proposals"."resolved_by_user_id" IS NULL)),
	CONSTRAINT "extraction_proposals_resolution_state" CHECK (
		("status" = 'pending' AND "resolved_at" IS NULL AND "approved_fact_id" IS NULL)
		OR ("status" = 'rejected' AND "resolved_at" IS NOT NULL AND "approved_fact_id" IS NULL)
		OR ("status" IN ('approved', 'merged') AND "resolved_at" IS NOT NULL AND "approved_fact_id" IS NOT NULL)
	)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "extraction_batches_id_workspace_unique" ON "extraction_batches" USING btree ("id","workspace_id");--> statement-breakpoint
ALTER TABLE "extraction_batches" ADD CONSTRAINT "extraction_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_batches" ADD CONSTRAINT "extraction_batches_source_workspace_fk" FOREIGN KEY ("source_document_id","workspace_id") REFERENCES "public"."source_documents"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_batches" ADD CONSTRAINT "extraction_batches_target_entry_workspace_fk" FOREIGN KEY ("target_career_entry_id","workspace_id") REFERENCES "public"."career_entries"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_proposals" ADD CONSTRAINT "extraction_proposals_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_proposals" ADD CONSTRAINT "extraction_proposals_batch_workspace_fk" FOREIGN KEY ("batch_id","workspace_id") REFERENCES "public"."extraction_batches"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_proposals" ADD CONSTRAINT "extraction_proposals_source_workspace_fk" FOREIGN KEY ("source_document_id","workspace_id") REFERENCES "public"."source_documents"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_proposals" ADD CONSTRAINT "extraction_proposals_target_entry_workspace_fk" FOREIGN KEY ("target_career_entry_id","workspace_id") REFERENCES "public"."career_entries"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_proposals" ADD CONSTRAINT "extraction_proposals_duplicate_fact_workspace_fk" FOREIGN KEY ("duplicate_of_fact_id","workspace_id") REFERENCES "public"."evidence_facts"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_proposals" ADD CONSTRAINT "extraction_proposals_approved_fact_workspace_fk" FOREIGN KEY ("approved_fact_id","workspace_id") REFERENCES "public"."evidence_facts"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extraction_batches_source_status_idx" ON "extraction_batches" USING btree ("source_document_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "extraction_proposals_id_workspace_unique" ON "extraction_proposals" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "extraction_proposals_batch_status_idx" ON "extraction_proposals" USING btree ("batch_id","status","created_at");
--> statement-breakpoint
CREATE INDEX "evidence_facts_workspace_approved_display_lower_idx" ON "evidence_facts" ("workspace_id", lower("display_text")) WHERE "status" = 'approved';
--> statement-breakpoint
CREATE UNIQUE INDEX "extraction_batches_one_pending_source_unique" ON "extraction_batches" ("workspace_id", "source_document_id") WHERE "status" = 'pending';
--> statement-breakpoint
CREATE FUNCTION reject_resolved_extraction_proposal_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF OLD.status <> 'pending' THEN
		RAISE EXCEPTION 'resolved extraction proposals are immutable' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER extraction_proposals_resolved_immutable
BEFORE UPDATE ON extraction_proposals
FOR EACH ROW EXECUTE FUNCTION reject_resolved_extraction_proposal_update();
