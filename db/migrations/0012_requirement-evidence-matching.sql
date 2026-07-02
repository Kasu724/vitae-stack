CREATE TYPE "public"."evidence_match_decision" AS ENUM('included', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."evidence_match_strength" AS ENUM('direct', 'combined', 'weak');--> statement-breakpoint
CREATE TABLE "requirement_evidence_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"decision" "evidence_match_decision" NOT NULL,
	"decided_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirement_evidence_decisions_revision_positive" CHECK ("requirement_evidence_decisions"."revision_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "requirement_evidence_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"match_run_id" uuid NOT NULL,
	"requirement_set_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"evidence_fact_id" uuid NOT NULL,
	"strength" "evidence_match_strength" NOT NULL,
	"score_basis_points" integer NOT NULL,
	"algorithm_version" text NOT NULL,
	"signals" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirement_evidence_matches_score_range" CHECK ("requirement_evidence_matches"."score_basis_points" >= 0 AND "requirement_evidence_matches"."score_basis_points" <= 10000),
	CONSTRAINT "requirement_evidence_matches_signals_object" CHECK (jsonb_typeof("requirement_evidence_matches"."signals") = 'object')
);
--> statement-breakpoint
CREATE TABLE "requirement_match_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requirement_set_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"algorithm_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"eligible_fact_count" integer NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirement_match_runs_revision_positive" CHECK ("requirement_match_runs"."revision_number" > 0),
	CONSTRAINT "requirement_match_runs_fact_count_nonnegative" CHECK ("requirement_match_runs"."eligible_fact_count" >= 0),
	CONSTRAINT "requirement_match_runs_hash_format" CHECK ("requirement_match_runs"."input_hash" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_evidence_matches_id_workspace_unique" ON "requirement_evidence_matches" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_match_runs_context_unique" ON "requirement_match_runs" USING btree ("id","workspace_id","requirement_set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_requirements_id_workspace_set_unique" ON "job_requirements" USING btree ("id","workspace_id","requirement_set_id");--> statement-breakpoint
ALTER TABLE "requirement_evidence_decisions" ADD CONSTRAINT "requirement_evidence_decisions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_evidence_decisions" ADD CONSTRAINT "requirement_evidence_decisions_match_workspace_fk" FOREIGN KEY ("match_id","workspace_id") REFERENCES "public"."requirement_evidence_matches"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_evidence_matches" ADD CONSTRAINT "requirement_evidence_matches_run_context_fk" FOREIGN KEY ("match_run_id","workspace_id","requirement_set_id") REFERENCES "public"."requirement_match_runs"("id","workspace_id","requirement_set_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_evidence_matches" ADD CONSTRAINT "requirement_evidence_matches_requirement_context_fk" FOREIGN KEY ("requirement_id","workspace_id","requirement_set_id") REFERENCES "public"."job_requirements"("id","workspace_id","requirement_set_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_evidence_matches" ADD CONSTRAINT "requirement_evidence_matches_fact_workspace_fk" FOREIGN KEY ("evidence_fact_id","workspace_id") REFERENCES "public"."evidence_facts"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_match_runs" ADD CONSTRAINT "requirement_match_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_match_runs" ADD CONSTRAINT "requirement_match_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_match_runs" ADD CONSTRAINT "requirement_match_runs_set_workspace_fk" FOREIGN KEY ("requirement_set_id","workspace_id") REFERENCES "public"."job_requirement_sets"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_evidence_decisions_match_revision_unique" ON "requirement_evidence_decisions" USING btree ("match_id","revision_number");--> statement-breakpoint
CREATE INDEX "requirement_evidence_decisions_workspace_created_idx" ON "requirement_evidence_decisions" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_evidence_matches_candidate_unique" ON "requirement_evidence_matches" USING btree ("match_run_id","requirement_id","evidence_fact_id");--> statement-breakpoint
CREATE INDEX "requirement_evidence_matches_requirement_score_idx" ON "requirement_evidence_matches" USING btree ("requirement_id","score_basis_points");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_match_runs_id_workspace_unique" ON "requirement_match_runs" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_match_runs_revision_unique" ON "requirement_match_runs" USING btree ("requirement_set_id","revision_number");--> statement-breakpoint
CREATE INDEX "requirement_match_runs_set_created_idx" ON "requirement_match_runs" USING btree ("requirement_set_id","created_at");--> statement-breakpoint
--> statement-breakpoint
CREATE FUNCTION protect_matching_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'UPDATE' OR pg_trigger_depth() = 1 THEN
		RAISE EXCEPTION 'matching history is append-only' USING ERRCODE = '23514';
	END IF;
	RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER requirement_match_runs_append_only BEFORE UPDATE OR DELETE ON requirement_match_runs FOR EACH ROW EXECUTE FUNCTION protect_matching_history();
--> statement-breakpoint
CREATE TRIGGER requirement_evidence_matches_append_only BEFORE UPDATE OR DELETE ON requirement_evidence_matches FOR EACH ROW EXECUTE FUNCTION protect_matching_history();
--> statement-breakpoint
CREATE TRIGGER requirement_evidence_decisions_append_only BEFORE UPDATE OR DELETE ON requirement_evidence_decisions FOR EACH ROW EXECUTE FUNCTION protect_matching_history();
