CREATE TABLE "ats_category_scores" (
	"workspace_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"weight" integer NOT NULL,
	"earned_points" integer NOT NULL,
	"applicable_points" integer NOT NULL,
	"score_basis_points" integer,
	CONSTRAINT "ats_category_scores_report_id_category_pk" PRIMARY KEY("report_id","category"),
	CONSTRAINT "ats_category_scores_bounds" CHECK ("ats_category_scores"."weight" > 0 AND "ats_category_scores"."earned_points" >= 0 AND "ats_category_scores"."applicable_points" >= 0 AND "ats_category_scores"."earned_points" <= "ats_category_scores"."applicable_points" AND ("ats_category_scores"."score_basis_points" IS NULL OR "ats_category_scores"."score_basis_points" BETWEEN 0 AND 10000))
);
--> statement-breakpoint
CREATE TABLE "ats_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"rule_id" text NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"location" jsonb NOT NULL,
	"measured" jsonb NOT NULL,
	"threshold" jsonb NOT NULL,
	"message" text NOT NULL,
	"remediation" text NOT NULL,
	"point_loss_basis_points" integer NOT NULL,
	"blocker" boolean DEFAULT false NOT NULL,
	CONSTRAINT "ats_findings_point_bounds" CHECK ("ats_findings"."point_loss_basis_points" BETWEEN 0 AND 10000),
	CONSTRAINT "ats_findings_objects" CHECK (jsonb_typeof("ats_findings"."location")='object' AND jsonb_typeof("ats_findings"."measured")='object' AND jsonb_typeof("ats_findings"."threshold")='object')
);
--> statement-breakpoint
CREATE TABLE "ats_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"job_posting_revision_id" uuid,
	"requirement_set_id" uuid,
	"ruleset_version" text NOT NULL,
	"document_hash" text NOT NULL,
	"job_hash" text,
	"input_hash" text NOT NULL,
	"evaluated_weight" integer NOT NULL,
	"overall_score_basis_points" integer,
	"blocker_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ats_reports_hashes" CHECK ("ats_reports"."document_hash" ~ '^sha256:[0-9a-f]{64}$' AND "ats_reports"."input_hash" ~ '^sha256:[0-9a-f]{64}$' AND ("ats_reports"."job_hash" IS NULL OR "ats_reports"."job_hash" ~ '^sha256:[0-9a-f]{64}$')),
	CONSTRAINT "ats_reports_score_bounds" CHECK ("ats_reports"."evaluated_weight" BETWEEN 0 AND 100 AND ("ats_reports"."overall_score_basis_points" IS NULL OR "ats_reports"."overall_score_basis_points" BETWEEN 0 AND 10000) AND "ats_reports"."blocker_count" >= 0),
	CONSTRAINT "ats_reports_context_pair" CHECK (("ats_reports"."job_posting_revision_id" IS NULL) = ("ats_reports"."requirement_set_id" IS NULL) AND ("ats_reports"."job_posting_revision_id" IS NULL) = ("ats_reports"."job_hash" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ats_reports_id_workspace_unique" ON "ats_reports" USING btree ("id","workspace_id");--> statement-breakpoint
ALTER TABLE "ats_category_scores" ADD CONSTRAINT "ats_category_scores_report_workspace_fk" FOREIGN KEY ("report_id","workspace_id") REFERENCES "public"."ats_reports"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ats_findings" ADD CONSTRAINT "ats_findings_report_workspace_fk" FOREIGN KEY ("report_id","workspace_id") REFERENCES "public"."ats_reports"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ats_reports" ADD CONSTRAINT "ats_reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ats_reports" ADD CONSTRAINT "ats_reports_version_workspace_fk" FOREIGN KEY ("document_version_id","workspace_id") REFERENCES "public"."document_versions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ats_reports" ADD CONSTRAINT "ats_reports_job_revision_workspace_fk" FOREIGN KEY ("job_posting_revision_id","workspace_id") REFERENCES "public"."job_posting_revisions"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ats_reports" ADD CONSTRAINT "ats_reports_requirement_set_workspace_fk" FOREIGN KEY ("requirement_set_id","workspace_id") REFERENCES "public"."job_requirement_sets"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ats_findings_report_sequence_unique" ON "ats_findings" USING btree ("report_id","sequence");--> statement-breakpoint
CREATE INDEX "ats_findings_report_category_idx" ON "ats_findings" USING btree ("report_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "ats_reports_workspace_input_unique" ON "ats_reports" USING btree ("workspace_id","input_hash");--> statement-breakpoint
CREATE INDEX "ats_reports_workspace_created_idx" ON "ats_reports" USING btree ("workspace_id","created_at");
--> statement-breakpoint
CREATE TRIGGER ats_reports_immutable
BEFORE UPDATE ON ats_reports
FOR EACH ROW EXECUTE FUNCTION reject_immutable_document_update();
--> statement-breakpoint
CREATE TRIGGER ats_category_scores_immutable
BEFORE UPDATE ON ats_category_scores
FOR EACH ROW EXECUTE FUNCTION reject_immutable_document_update();
--> statement-breakpoint
CREATE TRIGGER ats_findings_immutable
BEFORE UPDATE ON ats_findings
FOR EACH ROW EXECUTE FUNCTION reject_immutable_document_update();
