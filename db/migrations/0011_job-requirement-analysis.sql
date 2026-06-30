CREATE TYPE "public"."job_requirement_category" AS ENUM('required_qualification', 'preferred_qualification', 'responsibility', 'keyword', 'seniority', 'ambiguity');--> statement-breakpoint
CREATE TYPE "public"."job_requirement_decision" AS ENUM('proposed', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."job_requirement_priority" AS ENUM('required', 'preferred', 'informational');--> statement-breakpoint
CREATE TYPE "public"."job_requirement_set_method" AS ENUM('manual', 'deterministic', 'ai');--> statement-breakpoint
CREATE TYPE "public"."job_requirement_set_status" AS ENUM('draft', 'reviewed');--> statement-breakpoint
CREATE TABLE "job_requirement_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"job_posting_revision_id" uuid NOT NULL,
	"parent_set_id" uuid,
	"revision_number" integer NOT NULL,
	"method" "job_requirement_set_method" NOT NULL,
	"status" "job_requirement_set_status" DEFAULT 'draft' NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_requirement_sets_revision_positive" CHECK ("job_requirement_sets"."revision_number" > 0),
	CONSTRAINT "job_requirement_sets_reviewed_state" CHECK (("job_requirement_sets"."status" = 'draft' AND "job_requirement_sets"."reviewed_at" IS NULL) OR ("job_requirement_sets"."status" = 'reviewed' AND "job_requirement_sets"."reviewed_at" IS NOT NULL)),
	CONSTRAINT "job_requirement_sets_metadata_object" CHECK (jsonb_typeof("job_requirement_sets"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "job_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requirement_set_id" uuid NOT NULL,
	"category" "job_requirement_category" NOT NULL,
	"priority" "job_requirement_priority" NOT NULL,
	"decision" "job_requirement_decision" DEFAULT 'proposed' NOT NULL,
	"requirement_text" text NOT NULL,
	"source_start" integer,
	"source_end" integer,
	"source_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_requirements_text_not_blank" CHECK (length(btrim("job_requirements"."requirement_text")) > 0),
	CONSTRAINT "job_requirements_source_triplet" CHECK (("job_requirements"."source_start" IS NULL AND "job_requirements"."source_end" IS NULL AND "job_requirements"."source_text" IS NULL) OR ("job_requirements"."source_start" >= 0 AND "job_requirements"."source_end" > "job_requirements"."source_start" AND "job_requirements"."source_text" IS NOT NULL AND length("job_requirements"."source_text") > 0))
);
--> statement-breakpoint
ALTER TABLE "job_requirement_sets" ADD CONSTRAINT "job_requirement_sets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_requirement_sets" ADD CONSTRAINT "job_requirement_sets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_requirement_sets" ADD CONSTRAINT "job_requirement_sets_job_revision_workspace_fk" FOREIGN KEY ("job_posting_revision_id","workspace_id") REFERENCES "public"."job_posting_revisions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_requirement_sets" ADD CONSTRAINT "job_requirement_sets_parent_workspace_fk" FOREIGN KEY ("parent_set_id","workspace_id") REFERENCES "public"."job_requirement_sets"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_requirements" ADD CONSTRAINT "job_requirements_set_workspace_fk" FOREIGN KEY ("requirement_set_id","workspace_id") REFERENCES "public"."job_requirement_sets"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_requirement_sets_id_workspace_unique" ON "job_requirement_sets" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_requirement_sets_revision_unique" ON "job_requirement_sets" USING btree ("job_posting_revision_id","revision_number");--> statement-breakpoint
CREATE INDEX "job_requirement_sets_job_status_idx" ON "job_requirement_sets" USING btree ("job_posting_revision_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_requirements_id_workspace_unique" ON "job_requirements" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "job_requirements_set_category_idx" ON "job_requirements" USING btree ("requirement_set_id","category","decision");
--> statement-breakpoint
CREATE UNIQUE INDEX job_requirement_sets_one_draft_per_revision ON job_requirement_sets (job_posting_revision_id) WHERE status = 'draft';
--> statement-breakpoint
CREATE FUNCTION protect_reviewed_requirement_set() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' AND OLD.status = 'reviewed' AND pg_trigger_depth() = 1 THEN
		RAISE EXCEPTION 'reviewed requirement sets are immutable' USING ERRCODE = '23514';
	END IF;
	IF TG_OP = 'UPDATE' AND OLD.status = 'reviewed' THEN
		RAISE EXCEPTION 'reviewed requirement sets are immutable' USING ERRCODE = '23514';
	END IF;
	RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER job_requirement_sets_reviewed_immutable BEFORE UPDATE OR DELETE ON job_requirement_sets FOR EACH ROW EXECUTE FUNCTION protect_reviewed_requirement_set();
--> statement-breakpoint
CREATE FUNCTION protect_reviewed_requirement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	set_status job_requirement_set_status;
BEGIN
	SELECT status INTO set_status FROM job_requirement_sets WHERE id = OLD.requirement_set_id AND workspace_id = OLD.workspace_id;
	IF set_status = 'reviewed' AND (TG_OP = 'UPDATE' OR pg_trigger_depth() = 1) THEN
		RAISE EXCEPTION 'requirements in a reviewed set are immutable' USING ERRCODE = '23514';
	END IF;
	RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER job_requirements_reviewed_immutable BEFORE UPDATE OR DELETE ON job_requirements FOR EACH ROW EXECUTE FUNCTION protect_reviewed_requirement();
