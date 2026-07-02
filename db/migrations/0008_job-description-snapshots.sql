CREATE TYPE "public"."job_input_method" AS ENUM('text', 'file', 'url');--> statement-breakpoint
CREATE TYPE "public"."job_posting_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "job_posting_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"job_posting_id" uuid NOT NULL,
	"parent_revision_id" uuid,
	"source_document_id" uuid,
	"input_method" "job_input_method" NOT NULL,
	"revision_number" integer NOT NULL,
	"normalized_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{"schemaVersion":1,"warnings":[]}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_posting_revisions_number_positive" CHECK ("job_posting_revisions"."revision_number" > 0),
	CONSTRAINT "job_posting_revisions_text_not_blank" CHECK (length(btrim("job_posting_revisions"."normalized_text")) > 0),
	CONSTRAINT "job_posting_revisions_hash_format" CHECK ("job_posting_revisions"."content_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "job_posting_revisions_metadata_object" CHECK (jsonb_typeof("job_posting_revisions"."metadata") = 'object'),
	CONSTRAINT "job_posting_revisions_source_method" CHECK (("job_posting_revisions"."input_method" = 'file') = ("job_posting_revisions"."source_document_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "job_postings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"company" text,
	"status" "job_posting_status" DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_postings_revision_positive" CHECK ("job_postings"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "job_postings_id_workspace_unique" ON "job_postings" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_posting_revisions_id_workspace_unique" ON "job_posting_revisions" USING btree ("id","workspace_id");--> statement-breakpoint
ALTER TABLE "job_posting_revisions" ADD CONSTRAINT "job_posting_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_posting_revisions" ADD CONSTRAINT "job_posting_revisions_posting_workspace_fk" FOREIGN KEY ("job_posting_id","workspace_id") REFERENCES "public"."job_postings"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_posting_revisions" ADD CONSTRAINT "job_posting_revisions_parent_workspace_fk" FOREIGN KEY ("parent_revision_id","workspace_id") REFERENCES "public"."job_posting_revisions"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_posting_revisions" ADD CONSTRAINT "job_posting_revisions_source_workspace_fk" FOREIGN KEY ("source_document_id","workspace_id") REFERENCES "public"."source_documents"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_posting_revisions_number_unique" ON "job_posting_revisions" USING btree ("job_posting_id","revision_number");--> statement-breakpoint
CREATE INDEX "job_posting_revisions_job_created_idx" ON "job_posting_revisions" USING btree ("job_posting_id","created_at");--> statement-breakpoint
CREATE INDEX "job_postings_workspace_status_created_idx" ON "job_postings" USING btree ("workspace_id","status","created_at");
--> statement-breakpoint
CREATE FUNCTION reject_immutable_job_revision_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'immutable job revision cannot be updated' USING ERRCODE = 'check_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER job_posting_revisions_immutable
BEFORE UPDATE ON job_posting_revisions
FOR EACH ROW EXECUTE FUNCTION reject_immutable_job_revision_update();
