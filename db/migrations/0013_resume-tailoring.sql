CREATE TYPE "public"."tailoring_claim_relation" AS ENUM('direct', 'combines', 'paraphrases');--> statement-breakpoint
CREATE TYPE "public"."tailoring_kind" AS ENUM('resume', 'cover_letter');--> statement-breakpoint
CREATE TYPE "public"."tailoring_run_status" AS ENUM('generating', 'ready', 'failed', 'completed', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."tailoring_suggestion_operation" AS ENUM('replace_block_text', 'add_block_after', 'remove_block');--> statement-breakpoint
CREATE TYPE "public"."tailoring_suggestion_status" AS ENUM('pending', 'blocked', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "tailoring_claim_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"start_offset" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"text_hash" text NOT NULL,
	"relation" "tailoring_claim_relation" NOT NULL,
	CONSTRAINT "tailoring_claim_candidates_offset_bounds" CHECK ("tailoring_claim_candidates"."start_offset" >= 0 AND "tailoring_claim_candidates"."end_offset" > "tailoring_claim_candidates"."start_offset")
);
--> statement-breakpoint
CREATE TABLE "tailoring_claim_evidence" (
	"workspace_id" uuid NOT NULL,
	"claim_candidate_id" uuid NOT NULL,
	"evidence_fact_id" uuid NOT NULL,
	CONSTRAINT "tailoring_claim_evidence_claim_candidate_id_evidence_fact_id_pk" PRIMARY KEY("claim_candidate_id","evidence_fact_id")
);
--> statement-breakpoint
CREATE TABLE "tailoring_gaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"code" text NOT NULL,
	"detail" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tailoring_run_entries" (
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"career_entry_id" uuid NOT NULL,
	CONSTRAINT "tailoring_run_entries_run_id_career_entry_id_pk" PRIMARY KEY("run_id","career_entry_id")
);
--> statement-breakpoint
CREATE TABLE "tailoring_run_evidence" (
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"evidence_fact_id" uuid NOT NULL,
	CONSTRAINT "tailoring_run_evidence_run_id_evidence_fact_id_pk" PRIMARY KEY("run_id","evidence_fact_id")
);
--> statement-breakpoint
CREATE TABLE "tailoring_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "tailoring_kind" NOT NULL,
	"document_id" uuid NOT NULL,
	"base_version_id" uuid NOT NULL,
	"job_posting_revision_id" uuid NOT NULL,
	"requirement_set_id" uuid NOT NULL,
	"match_run_id" uuid NOT NULL,
	"provider_configuration_id" uuid,
	"model" text,
	"status" "tailoring_run_status" DEFAULT 'generating' NOT NULL,
	"idempotency_key" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"failure_code" text,
	"created_by_user_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tailoring_runs_manifest_object" CHECK (jsonb_typeof("tailoring_runs"."manifest") = 'object'),
	CONSTRAINT "tailoring_runs_terminal_state" CHECK (("tailoring_runs"."status" IN ('generating','ready') AND "tailoring_runs"."completed_at" IS NULL AND "tailoring_runs"."failure_code" IS NULL)
          OR ("tailoring_runs"."status" IN ('completed','discarded') AND "tailoring_runs"."completed_at" IS NOT NULL AND "tailoring_runs"."failure_code" IS NULL)
          OR ("tailoring_runs"."status" = 'failed' AND "tailoring_runs"."completed_at" IS NOT NULL AND "tailoring_runs"."failure_code" IS NOT NULL)),
	CONSTRAINT "tailoring_runs_provider_model_pair" CHECK (("tailoring_runs"."provider_configuration_id" IS NULL) = ("tailoring_runs"."model" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "tailoring_suggestion_requirements" (
	"workspace_id" uuid NOT NULL,
	"suggestion_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	CONSTRAINT "tailoring_suggestion_requirements_suggestion_id_requirement_id_pk" PRIMARY KEY("suggestion_id","requirement_id")
);
--> statement-breakpoint
CREATE TABLE "tailoring_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"operation" "tailoring_suggestion_operation" NOT NULL,
	"target_section_id" uuid NOT NULL,
	"target_block_id" uuid,
	"base_block_hash" text,
	"before_text" text,
	"after_text" text,
	"rationale" text NOT NULL,
	"task_id" text NOT NULL,
	"task_version" text NOT NULL,
	"status" "tailoring_suggestion_status" DEFAULT 'pending' NOT NULL,
	"blocked_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tailoring_suggestions_replace_fields" CHECK (("tailoring_suggestions"."operation" <> 'replace_block_text') OR ("tailoring_suggestions"."target_block_id" IS NOT NULL AND "tailoring_suggestions"."base_block_hash" IS NOT NULL AND "tailoring_suggestions"."before_text" IS NOT NULL AND "tailoring_suggestions"."after_text" IS NOT NULL)),
	CONSTRAINT "tailoring_suggestions_blocked_pair" CHECK (("tailoring_suggestions"."status" = 'blocked') = ("tailoring_suggestions"."blocked_code" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tailoring_claim_candidates_id_workspace_unique" ON "tailoring_claim_candidates" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tailoring_runs_id_workspace_unique" ON "tailoring_runs" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tailoring_suggestions_id_workspace_unique" ON "tailoring_suggestions" USING btree ("id","workspace_id");--> statement-breakpoint
ALTER TABLE "tailoring_claim_candidates" ADD CONSTRAINT "tailoring_claim_candidates_suggestion_workspace_fk" FOREIGN KEY ("suggestion_id","workspace_id") REFERENCES "public"."tailoring_suggestions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_claim_evidence" ADD CONSTRAINT "tailoring_claim_evidence_claim_workspace_fk" FOREIGN KEY ("claim_candidate_id","workspace_id") REFERENCES "public"."tailoring_claim_candidates"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_claim_evidence" ADD CONSTRAINT "tailoring_claim_evidence_fact_workspace_fk" FOREIGN KEY ("evidence_fact_id","workspace_id") REFERENCES "public"."evidence_facts"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_gaps" ADD CONSTRAINT "tailoring_gaps_run_workspace_fk" FOREIGN KEY ("run_id","workspace_id") REFERENCES "public"."tailoring_runs"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_gaps" ADD CONSTRAINT "tailoring_gaps_requirement_workspace_fk" FOREIGN KEY ("requirement_id","workspace_id") REFERENCES "public"."job_requirements"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_run_entries" ADD CONSTRAINT "tailoring_run_entries_run_workspace_fk" FOREIGN KEY ("run_id","workspace_id") REFERENCES "public"."tailoring_runs"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_run_entries" ADD CONSTRAINT "tailoring_run_entries_entry_workspace_fk" FOREIGN KEY ("career_entry_id","workspace_id") REFERENCES "public"."career_entries"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_run_evidence" ADD CONSTRAINT "tailoring_run_evidence_run_workspace_fk" FOREIGN KEY ("run_id","workspace_id") REFERENCES "public"."tailoring_runs"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_run_evidence" ADD CONSTRAINT "tailoring_run_evidence_fact_workspace_fk" FOREIGN KEY ("evidence_fact_id","workspace_id") REFERENCES "public"."evidence_facts"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_runs" ADD CONSTRAINT "tailoring_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_runs" ADD CONSTRAINT "tailoring_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_runs" ADD CONSTRAINT "tailoring_runs_document_workspace_fk" FOREIGN KEY ("document_id","workspace_id") REFERENCES "public"."documents"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_runs" ADD CONSTRAINT "tailoring_runs_base_version_workspace_fk" FOREIGN KEY ("base_version_id","workspace_id") REFERENCES "public"."document_versions"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_runs" ADD CONSTRAINT "tailoring_runs_job_revision_workspace_fk" FOREIGN KEY ("job_posting_revision_id","workspace_id") REFERENCES "public"."job_posting_revisions"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_runs" ADD CONSTRAINT "tailoring_runs_requirement_set_workspace_fk" FOREIGN KEY ("requirement_set_id","workspace_id") REFERENCES "public"."job_requirement_sets"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_runs" ADD CONSTRAINT "tailoring_runs_match_context_fk" FOREIGN KEY ("match_run_id","workspace_id","requirement_set_id") REFERENCES "public"."requirement_match_runs"("id","workspace_id","requirement_set_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_runs" ADD CONSTRAINT "tailoring_runs_provider_workspace_fk" FOREIGN KEY ("provider_configuration_id","workspace_id") REFERENCES "public"."model_provider_configurations"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_suggestion_requirements" ADD CONSTRAINT "tailoring_suggestion_requirements_suggestion_workspace_fk" FOREIGN KEY ("suggestion_id","workspace_id") REFERENCES "public"."tailoring_suggestions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_suggestion_requirements" ADD CONSTRAINT "tailoring_suggestion_requirements_requirement_workspace_fk" FOREIGN KEY ("requirement_id","workspace_id") REFERENCES "public"."job_requirements"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_suggestions" ADD CONSTRAINT "tailoring_suggestions_run_workspace_fk" FOREIGN KEY ("run_id","workspace_id") REFERENCES "public"."tailoring_runs"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tailoring_claim_candidates_suggestion_idx" ON "tailoring_claim_candidates" USING btree ("suggestion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tailoring_gaps_run_requirement_unique" ON "tailoring_gaps" USING btree ("run_id","requirement_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "tailoring_runs_idempotency_unique" ON "tailoring_runs" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "tailoring_runs_workspace_status_created_idx" ON "tailoring_runs" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tailoring_suggestions_run_sequence_unique" ON "tailoring_suggestions" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE INDEX "tailoring_suggestions_run_status_idx" ON "tailoring_suggestions" USING btree ("run_id","status");
--> statement-breakpoint
CREATE FUNCTION protect_tailoring_run_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW.id <> OLD.id OR NEW.workspace_id <> OLD.workspace_id OR NEW.kind <> OLD.kind OR NEW.document_id <> OLD.document_id OR NEW.base_version_id <> OLD.base_version_id OR NEW.job_posting_revision_id <> OLD.job_posting_revision_id OR NEW.requirement_set_id <> OLD.requirement_set_id OR NEW.match_run_id <> OLD.match_run_id OR NEW.provider_configuration_id IS DISTINCT FROM OLD.provider_configuration_id OR NEW.model IS DISTINCT FROM OLD.model OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.manifest <> OLD.manifest THEN
		RAISE EXCEPTION 'tailoring run context is immutable' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER tailoring_run_context_immutable BEFORE UPDATE ON tailoring_runs FOR EACH ROW EXECUTE FUNCTION protect_tailoring_run_context();
--> statement-breakpoint
CREATE FUNCTION protect_tailoring_suggestion_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW.id <> OLD.id OR NEW.workspace_id <> OLD.workspace_id OR NEW.run_id <> OLD.run_id OR NEW.sequence <> OLD.sequence OR NEW.operation <> OLD.operation OR NEW.target_section_id <> OLD.target_section_id OR NEW.target_block_id IS DISTINCT FROM OLD.target_block_id OR NEW.base_block_hash IS DISTINCT FROM OLD.base_block_hash OR NEW.before_text IS DISTINCT FROM OLD.before_text OR NEW.after_text IS DISTINCT FROM OLD.after_text OR NEW.rationale <> OLD.rationale OR NEW.task_id <> OLD.task_id OR NEW.task_version <> OLD.task_version THEN
		RAISE EXCEPTION 'tailoring suggestion content is immutable' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER tailoring_suggestion_content_immutable BEFORE UPDATE ON tailoring_suggestions FOR EACH ROW EXECUTE FUNCTION protect_tailoring_suggestion_content();
