CREATE TYPE "public"."generated_claim_status" AS ENUM('supported', 'unverified', 'nonfactual');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('resume', 'cover_letter');--> statement-breakpoint
CREATE TYPE "public"."document_lock_target" AS ENUM('block', 'claim', 'fact');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."document_version_reason" AS ENUM('initial', 'manual_save', 'restore', 'import', 'tailoring', 'suggestion_batch');--> statement-breakpoint
CREATE TABLE "claim_evidence" (
	"workspace_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"evidence_fact_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_evidence_pk" PRIMARY KEY("claim_id","evidence_fact_id")
);
--> statement-breakpoint
CREATE TABLE "document_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"base_version_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_drafts_revision_positive" CHECK ("document_drafts"."revision" > 0),
	CONSTRAINT "document_drafts_content_object" CHECK (jsonb_typeof("document_drafts"."content") = 'object')
);
--> statement-breakpoint
CREATE TABLE "document_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"target_type" "document_lock_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"locked_hash" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"stable_section_id" uuid NOT NULL,
	"section_type" text NOT NULL,
	"heading" text,
	"position" integer NOT NULL,
	"content_hash" text NOT NULL,
	CONSTRAINT "document_sections_position_nonnegative" CHECK ("document_sections"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"parent_version_id" uuid,
	"restored_from_version_id" uuid,
	"author_user_id" uuid,
	"reason" "document_version_reason" NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_versions_schema_positive" CHECK ("document_versions"."schema_version" > 0),
	CONSTRAINT "document_versions_content_object" CHECK (jsonb_typeof("document_versions"."content") = 'object'),
	CONSTRAINT "document_versions_hash_format" CHECK ("document_versions"."content_hash" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"career_profile_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"title" text NOT NULL,
	"status" "document_status" DEFAULT 'active' NOT NULL,
	"current_version_id" uuid,
	"archived_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_revision_positive" CHECK ("documents"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "generated_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"stable_block_id" uuid NOT NULL,
	"start_offset" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"text_hash" text NOT NULL,
	"status" "generated_claim_status" NOT NULL,
	"source_claim_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generated_claims_offset_bounds" CHECK ("generated_claims"."start_offset" >= 0 AND "generated_claims"."end_offset" > "generated_claims"."start_offset")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "documents_id_workspace_unique" ON "documents" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_id_workspace_unique" ON "document_versions" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_claims_id_workspace_unique" ON "generated_claims" USING btree ("id","workspace_id");--> statement-breakpoint
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_claim_workspace_fk" FOREIGN KEY ("claim_id","workspace_id") REFERENCES "public"."generated_claims"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_fact_workspace_fk" FOREIGN KEY ("evidence_fact_id","workspace_id") REFERENCES "public"."evidence_facts"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_drafts" ADD CONSTRAINT "document_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_drafts" ADD CONSTRAINT "document_drafts_document_workspace_fk" FOREIGN KEY ("document_id","workspace_id") REFERENCES "public"."documents"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_drafts" ADD CONSTRAINT "document_drafts_base_workspace_fk" FOREIGN KEY ("base_version_id","workspace_id") REFERENCES "public"."document_versions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_locks" ADD CONSTRAINT "document_locks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_locks" ADD CONSTRAINT "document_locks_document_workspace_fk" FOREIGN KEY ("document_id","workspace_id") REFERENCES "public"."documents"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sections" ADD CONSTRAINT "document_sections_version_workspace_fk" FOREIGN KEY ("version_id","workspace_id") REFERENCES "public"."document_versions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_workspace_fk" FOREIGN KEY ("document_id","workspace_id") REFERENCES "public"."documents"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_parent_workspace_fk" FOREIGN KEY ("parent_version_id","workspace_id") REFERENCES "public"."document_versions"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_restore_workspace_fk" FOREIGN KEY ("restored_from_version_id","workspace_id") REFERENCES "public"."document_versions"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_profile_workspace_fk" FOREIGN KEY ("career_profile_id","workspace_id") REFERENCES "public"."career_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_claims" ADD CONSTRAINT "generated_claims_version_workspace_fk" FOREIGN KEY ("version_id","workspace_id") REFERENCES "public"."document_versions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_claims" ADD CONSTRAINT "generated_claims_source_workspace_fk" FOREIGN KEY ("source_claim_id","workspace_id") REFERENCES "public"."generated_claims"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_current_version_workspace_fk" FOREIGN KEY ("current_version_id","workspace_id") REFERENCES "public"."document_versions"("id","workspace_id") DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE UNIQUE INDEX "document_drafts_document_user_unique" ON "document_drafts" USING btree ("document_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_locks_target_unique" ON "document_locks" USING btree ("document_id","target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_sections_version_stable_unique" ON "document_sections" USING btree ("version_id","stable_section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_sections_version_position_unique" ON "document_sections" USING btree ("version_id","position");--> statement-breakpoint
CREATE INDEX "document_versions_document_hash_idx" ON "document_versions" USING btree ("document_id","content_hash");--> statement-breakpoint
CREATE INDEX "document_versions_document_created_idx" ON "document_versions" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_workspace_kind_status_idx" ON "documents" USING btree ("workspace_id","kind","status");--> statement-breakpoint
CREATE INDEX "generated_claims_version_status_idx" ON "generated_claims" USING btree ("version_id","status");--> statement-breakpoint
CREATE FUNCTION reject_immutable_document_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'immutable document history cannot be updated' USING ERRCODE = 'check_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER document_versions_immutable BEFORE UPDATE ON document_versions FOR EACH ROW EXECUTE FUNCTION reject_immutable_document_update();--> statement-breakpoint
CREATE TRIGGER document_sections_immutable BEFORE UPDATE ON document_sections FOR EACH ROW EXECUTE FUNCTION reject_immutable_document_update();--> statement-breakpoint
CREATE TRIGGER generated_claims_immutable BEFORE UPDATE ON generated_claims FOR EACH ROW EXECUTE FUNCTION reject_immutable_document_update();--> statement-breakpoint
CREATE TRIGGER claim_evidence_immutable BEFORE UPDATE ON claim_evidence FOR EACH ROW EXECUTE FUNCTION reject_immutable_document_update();
