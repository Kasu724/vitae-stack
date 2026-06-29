CREATE TYPE "public"."career_entry_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."career_entry_type" AS ENUM('work', 'internship', 'project', 'research', 'education', 'certification', 'award', 'leadership', 'extracurricular', 'volunteering', 'coursework', 'publication', 'accomplishment', 'metric', 'skill', 'custom');--> statement-breakpoint
CREATE TYPE "public"."date_precision" AS ENUM('day', 'month', 'year');--> statement-breakpoint
CREATE TYPE "public"."evidence_fact_status" AS ENUM('approved', 'superseded', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."evidence_fact_type" AS ENUM('statement', 'metric', 'date', 'skill', 'accomplishment', 'education', 'custom');--> statement-breakpoint
CREATE TYPE "public"."fact_proposal_status" AS ENUM('pending', 'approved', 'rejected', 'merged');--> statement-breakpoint
CREATE TYPE "public"."skill_proficiency" AS ENUM('familiar', 'working', 'advanced', 'expert');--> statement-breakpoint
CREATE TABLE "career_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"career_profile_id" uuid NOT NULL,
	"type" "career_entry_type" NOT NULL,
	"title" text NOT NULL,
	"organization" text,
	"location" text,
	"description" text,
	"start_date" date,
	"start_date_precision" date_precision,
	"end_date" date,
	"end_date_precision" date_precision,
	"is_current" boolean DEFAULT false NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "career_entry_status" DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "career_entries_date_pairs" CHECK (("career_entries"."start_date" IS NULL) = ("career_entries"."start_date_precision" IS NULL)
          AND ("career_entries"."end_date" IS NULL) = ("career_entries"."end_date_precision" IS NULL)),
	CONSTRAINT "career_entries_date_order" CHECK ("career_entries"."end_date" IS NULL OR "career_entries"."start_date" IS NULL OR "career_entries"."end_date" >= "career_entries"."start_date"),
	CONSTRAINT "career_entries_current_has_no_end" CHECK (NOT "career_entries"."is_current" OR "career_entries"."end_date" IS NULL),
	CONSTRAINT "career_entries_revision_positive" CHECK ("career_entries"."revision" > 0),
	CONSTRAINT "career_entries_attributes_object" CHECK (jsonb_typeof("career_entries"."attributes") = 'object')
);
--> statement-breakpoint
CREATE TABLE "career_entry_skills" (
	"workspace_id" uuid NOT NULL,
	"career_entry_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"evidence_fact_id" uuid,
	"proficiency" "skill_proficiency",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "career_entry_skills_pk" PRIMARY KEY("career_entry_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "career_profile_settings" (
	"workspace_id" uuid NOT NULL,
	"career_profile_id" uuid NOT NULL,
	"career_goals" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"target_roles" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"writing_preferences" jsonb DEFAULT '{"tone":"direct","locale":"en-US","serialComma":true}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "career_profile_settings_pk" PRIMARY KEY("workspace_id","career_profile_id"),
	CONSTRAINT "career_profile_settings_writing_object" CHECK (jsonb_typeof("career_profile_settings"."writing_preferences") = 'object')
);
--> statement-breakpoint
CREATE TABLE "evidence_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"career_entry_id" uuid NOT NULL,
	"type" "evidence_fact_type" NOT NULL,
	"value" jsonb NOT NULL,
	"display_text" text NOT NULL,
	"source_locator" jsonb NOT NULL,
	"status" "evidence_fact_status" DEFAULT 'approved' NOT NULL,
	"supersedes_fact_id" uuid,
	"approved_by_user_id" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_by_user_id" uuid,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_facts_value_object" CHECK (jsonb_typeof("evidence_facts"."value") = 'object'),
	CONSTRAINT "evidence_facts_locator_object" CHECK (jsonb_typeof("evidence_facts"."source_locator") = 'object'),
	CONSTRAINT "evidence_facts_withdrawal_pair" CHECK (("evidence_facts"."withdrawn_at" IS NULL) = ("evidence_facts"."withdrawn_by_user_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "fact_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"career_entry_id" uuid NOT NULL,
	"type" "evidence_fact_type" NOT NULL,
	"proposed_value" jsonb NOT NULL,
	"display_text" text NOT NULL,
	"source_locator" jsonb NOT NULL,
	"status" "fact_proposal_status" DEFAULT 'pending' NOT NULL,
	"approved_fact_id" uuid,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fact_proposals_value_object" CHECK (jsonb_typeof("fact_proposals"."proposed_value") = 'object'),
	CONSTRAINT "fact_proposals_locator_object" CHECK (jsonb_typeof("fact_proposals"."source_locator") = 'object'),
	CONSTRAINT "fact_proposals_resolution_pair" CHECK (("fact_proposals"."resolved_at" IS NULL) = ("fact_proposals"."resolved_by_user_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"canonical_name" text NOT NULL,
	"display_name" text NOT NULL,
	"category" text,
	"aliases" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "career_entries_id_workspace_unique" ON "career_entries" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_facts_id_workspace_unique" ON "evidence_facts" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_id_workspace_unique" ON "skills" USING btree ("id","workspace_id");--> statement-breakpoint
ALTER TABLE "career_entries" ADD CONSTRAINT "career_entries_profile_workspace_fk" FOREIGN KEY ("career_profile_id","workspace_id") REFERENCES "public"."career_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_entry_skills" ADD CONSTRAINT "career_entry_skills_entry_workspace_fk" FOREIGN KEY ("career_entry_id","workspace_id") REFERENCES "public"."career_entries"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_entry_skills" ADD CONSTRAINT "career_entry_skills_skill_workspace_fk" FOREIGN KEY ("skill_id","workspace_id") REFERENCES "public"."skills"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_entry_skills" ADD CONSTRAINT "career_entry_skills_fact_workspace_fk" FOREIGN KEY ("evidence_fact_id","workspace_id") REFERENCES "public"."evidence_facts"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_profile_settings" ADD CONSTRAINT "career_profile_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_profile_settings" ADD CONSTRAINT "career_profile_settings_profile_workspace_fk" FOREIGN KEY ("career_profile_id","workspace_id") REFERENCES "public"."career_profiles"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_facts" ADD CONSTRAINT "evidence_facts_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_facts" ADD CONSTRAINT "evidence_facts_withdrawn_by_user_id_users_id_fk" FOREIGN KEY ("withdrawn_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_facts" ADD CONSTRAINT "evidence_facts_entry_workspace_fk" FOREIGN KEY ("career_entry_id","workspace_id") REFERENCES "public"."career_entries"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_facts" ADD CONSTRAINT "evidence_facts_supersedes_workspace_fk" FOREIGN KEY ("supersedes_fact_id","workspace_id") REFERENCES "public"."evidence_facts"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_proposals" ADD CONSTRAINT "fact_proposals_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_proposals" ADD CONSTRAINT "fact_proposals_entry_workspace_fk" FOREIGN KEY ("career_entry_id","workspace_id") REFERENCES "public"."career_entries"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_proposals" ADD CONSTRAINT "fact_proposals_approved_fact_workspace_fk" FOREIGN KEY ("approved_fact_id","workspace_id") REFERENCES "public"."evidence_facts"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "career_entries_workspace_status_type_idx" ON "career_entries" USING btree ("workspace_id","status","type");--> statement-breakpoint
CREATE INDEX "career_entries_tags_idx" ON "career_entries" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "career_entry_skills_workspace_idx" ON "career_entry_skills" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "evidence_facts_workspace_status_idx" ON "evidence_facts" USING btree ("workspace_id","status","type");--> statement-breakpoint
CREATE UNIQUE INDEX "fact_proposals_id_workspace_unique" ON "fact_proposals" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "fact_proposals_workspace_status_idx" ON "fact_proposals" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_workspace_canonical_unique" ON "skills" USING btree ("workspace_id","canonical_name");--> statement-breakpoint
CREATE INDEX "skills_workspace_display_idx" ON "skills" USING btree ("workspace_id","display_name");
--> statement-breakpoint
CREATE FUNCTION protect_evidence_fact_immutability() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF NEW.id IS DISTINCT FROM OLD.id
		OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
		OR NEW.career_entry_id IS DISTINCT FROM OLD.career_entry_id
		OR NEW.type IS DISTINCT FROM OLD.type
		OR NEW.value IS DISTINCT FROM OLD.value
		OR NEW.display_text IS DISTINCT FROM OLD.display_text
		OR NEW.source_locator IS DISTINCT FROM OLD.source_locator
		OR NEW.supersedes_fact_id IS DISTINCT FROM OLD.supersedes_fact_id
		OR NEW.approved_by_user_id IS DISTINCT FROM OLD.approved_by_user_id
		OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
		OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
		RAISE EXCEPTION 'approved evidence content is immutable' USING ERRCODE = 'check_violation';
	END IF;

	IF OLD.status <> 'approved' OR NEW.status NOT IN ('superseded', 'withdrawn') THEN
		RAISE EXCEPTION 'invalid evidence lifecycle transition' USING ERRCODE = 'check_violation';
	END IF;

	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER evidence_facts_immutable_update
BEFORE UPDATE ON evidence_facts
FOR EACH ROW EXECUTE FUNCTION protect_evidence_fact_immutability();
