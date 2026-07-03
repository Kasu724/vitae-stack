-- Reviewed initial schema for the local-only SQLite application.
PRAGMA foreign_keys = OFF;

CREATE TABLE "career_profiles" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "headline" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "career_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE
);

CREATE TABLE "career_entries" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "career_profile_id" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('work', 'internship', 'project', 'research', 'education', 'certification', 'award', 'leadership', 'extracurricular', 'volunteering', 'coursework', 'publication', 'accomplishment', 'metric', 'skill', 'custom')),
  "title" TEXT NOT NULL,
  "organization" TEXT,
  "location" TEXT,
  "description" TEXT,
  "start_date" TEXT,
  "start_date_precision" TEXT CHECK ("start_date_precision" IN ('day', 'month', 'year')),
  "end_date" TEXT,
  "end_date_precision" TEXT CHECK ("end_date_precision" IN ('day', 'month', 'year')),
  "is_current" INTEGER NOT NULL DEFAULT 0,
  "tags" TEXT NOT NULL DEFAULT '[]',
  "attributes" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'archived')),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "career_entries_profile_workspace_fk" FOREIGN KEY ("career_profile_id", "workspace_id") REFERENCES "career_profiles" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "career_entries_date_pairs" CHECK (("start_date" IS NULL) = ("start_date_precision" IS NULL)
          AND ("end_date" IS NULL) = ("end_date_precision" IS NULL)),
  CONSTRAINT "career_entries_date_order" CHECK ("end_date" IS NULL OR "start_date" IS NULL OR "end_date" >= "start_date"),
  CONSTRAINT "career_entries_current_has_no_end" CHECK (NOT "is_current" OR "end_date" IS NULL),
  CONSTRAINT "career_entries_revision_positive" CHECK ("revision" > 0),
  CONSTRAINT "career_entries_attributes_object" CHECK (json_type("attributes") = 'object')
);

CREATE TABLE "career_entry_skills" (
  "workspace_id" TEXT NOT NULL,
  "career_entry_id" TEXT NOT NULL,
  "skill_id" TEXT NOT NULL,
  "evidence_fact_id" TEXT,
  "proficiency" TEXT CHECK ("proficiency" IN ('familiar', 'working', 'advanced', 'expert')),
  "created_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "career_entry_skills_pk" PRIMARY KEY ("career_entry_id", "skill_id"),
  CONSTRAINT "career_entry_skills_entry_workspace_fk" FOREIGN KEY ("career_entry_id", "workspace_id") REFERENCES "career_entries" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "career_entry_skills_skill_workspace_fk" FOREIGN KEY ("skill_id", "workspace_id") REFERENCES "skills" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "career_entry_skills_fact_workspace_fk" FOREIGN KEY ("evidence_fact_id", "workspace_id") REFERENCES "evidence_facts" ("id", "workspace_id") ON DELETE RESTRICT
);

CREATE TABLE "career_profile_settings" (
  "workspace_id" TEXT NOT NULL,
  "career_profile_id" TEXT NOT NULL,
  "career_goals" TEXT NOT NULL DEFAULT '[]',
  "target_roles" TEXT NOT NULL DEFAULT '[]',
  "writing_preferences" TEXT NOT NULL DEFAULT '{"tone":"direct","locale":"en-US","serialComma":true}',
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "career_profile_settings_pk" PRIMARY KEY ("workspace_id", "career_profile_id"),
  CONSTRAINT "career_profile_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  CONSTRAINT "career_profile_settings_profile_workspace_fk" FOREIGN KEY ("career_profile_id", "workspace_id") REFERENCES "career_profiles" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "career_profile_settings_writing_object" CHECK (json_type("writing_preferences") = 'object')
);

CREATE TABLE "evidence_facts" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "career_entry_id" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('statement', 'metric', 'date', 'skill', 'accomplishment', 'education', 'custom')),
  "value" TEXT NOT NULL,
  "display_text" TEXT NOT NULL,
  "source_locator" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'approved' CHECK ("status" IN ('approved', 'superseded', 'withdrawn')),
  "supersedes_fact_id" TEXT,
  "approved_by_user_id" TEXT NOT NULL,
  "approved_at" TEXT NOT NULL DEFAULT (now()),
  "withdrawn_by_user_id" TEXT,
  "withdrawn_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "evidence_facts_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT,
  CONSTRAINT "evidence_facts_withdrawn_by_user_id_users_id_fk" FOREIGN KEY ("withdrawn_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "evidence_facts_entry_workspace_fk" FOREIGN KEY ("career_entry_id", "workspace_id") REFERENCES "career_entries" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "evidence_facts_supersedes_workspace_fk" FOREIGN KEY ("supersedes_fact_id", "workspace_id") REFERENCES "evidence_facts" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "evidence_facts_value_object" CHECK (json_type("value") = 'object'),
  CONSTRAINT "evidence_facts_locator_object" CHECK (json_type("source_locator") = 'object'),
  CONSTRAINT "evidence_facts_withdrawal_pair" CHECK (("withdrawn_at" IS NULL) = ("withdrawn_by_user_id" IS NULL))
);

CREATE TABLE "fact_proposals" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "career_entry_id" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('statement', 'metric', 'date', 'skill', 'accomplishment', 'education', 'custom')),
  "proposed_value" TEXT NOT NULL,
  "display_text" TEXT NOT NULL,
  "source_locator" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'approved', 'rejected', 'merged')),
  "approved_fact_id" TEXT,
  "resolved_by_user_id" TEXT,
  "resolved_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "fact_proposals_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "fact_proposals_entry_workspace_fk" FOREIGN KEY ("career_entry_id", "workspace_id") REFERENCES "career_entries" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "fact_proposals_approved_fact_workspace_fk" FOREIGN KEY ("approved_fact_id", "workspace_id") REFERENCES "evidence_facts" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "fact_proposals_value_object" CHECK (json_type("proposed_value") = 'object'),
  CONSTRAINT "fact_proposals_locator_object" CHECK (json_type("source_locator") = 'object'),
  CONSTRAINT "fact_proposals_resolution_pair" CHECK (("resolved_at" IS NULL) = ("resolved_by_user_id" IS NULL))
);

CREATE TABLE "skills" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "canonical_name" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "category" TEXT,
  "aliases" TEXT NOT NULL DEFAULT '[]',
  "archived_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "skills_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE
);

CREATE TABLE "claim_evidence" (
  "workspace_id" TEXT NOT NULL,
  "claim_id" TEXT NOT NULL,
  "evidence_fact_id" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "claim_evidence_pk" PRIMARY KEY ("claim_id", "evidence_fact_id"),
  CONSTRAINT "claim_evidence_claim_workspace_fk" FOREIGN KEY ("claim_id", "workspace_id") REFERENCES "generated_claims" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "claim_evidence_fact_workspace_fk" FOREIGN KEY ("evidence_fact_id", "workspace_id") REFERENCES "evidence_facts" ("id", "workspace_id") ON DELETE RESTRICT
);

CREATE TABLE "document_drafts" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "base_version_id" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "expires_at" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "document_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
  CONSTRAINT "document_drafts_document_workspace_fk" FOREIGN KEY ("document_id", "workspace_id") REFERENCES "documents" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "document_drafts_base_workspace_fk" FOREIGN KEY ("base_version_id", "workspace_id") REFERENCES "document_versions" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "document_drafts_revision_positive" CHECK ("revision" > 0),
  CONSTRAINT "document_drafts_content_object" CHECK (json_type("content") = 'object')
);

CREATE TABLE "document_locks" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "target_type" TEXT NOT NULL CHECK ("target_type" IN ('section', 'block', 'claim', 'fact')),
  "target_id" TEXT NOT NULL,
  "locked_hash" TEXT NOT NULL,
  "created_by_user_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "document_locks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "document_locks_document_workspace_fk" FOREIGN KEY ("document_id", "workspace_id") REFERENCES "documents" ("id", "workspace_id") ON DELETE CASCADE
);

CREATE TABLE "document_sections" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "stable_section_id" TEXT NOT NULL,
  "section_type" TEXT NOT NULL,
  "heading" TEXT,
  "position" INTEGER NOT NULL,
  "content_hash" TEXT NOT NULL,
  CONSTRAINT "document_sections_version_workspace_fk" FOREIGN KEY ("version_id", "workspace_id") REFERENCES "document_versions" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "document_sections_position_nonnegative" CHECK ("position" >= 0)
);

CREATE TABLE "document_versions" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "parent_version_id" TEXT,
  "restored_from_version_id" TEXT,
  "author_user_id" TEXT,
  "reason" TEXT NOT NULL CHECK ("reason" IN ('initial', 'manual_save', 'restore', 'import', 'tailoring', 'suggestion_batch')),
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "content" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "document_versions_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "document_versions_document_workspace_fk" FOREIGN KEY ("document_id", "workspace_id") REFERENCES "documents" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "document_versions_parent_workspace_fk" FOREIGN KEY ("parent_version_id", "workspace_id") REFERENCES "document_versions" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "document_versions_restore_workspace_fk" FOREIGN KEY ("restored_from_version_id", "workspace_id") REFERENCES "document_versions" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "document_versions_schema_positive" CHECK ("schema_version" > 0),
  CONSTRAINT "document_versions_content_object" CHECK (json_type("content") = 'object'),
  CONSTRAINT "document_versions_hash_format" CHECK (regexp('^sha256:[0-9a-f]{64}$', "content_hash"))
);

CREATE TABLE "documents" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "career_profile_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('resume', 'cover_letter')),
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'archived')),
  "current_version_id" TEXT,
  "archived_at" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "documents_profile_workspace_fk" FOREIGN KEY ("career_profile_id", "workspace_id") REFERENCES "career_profiles" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "documents_revision_positive" CHECK ("revision" > 0)
);

CREATE TABLE "generated_claims" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "stable_block_id" TEXT NOT NULL,
  "start_offset" INTEGER NOT NULL,
  "end_offset" INTEGER NOT NULL,
  "text_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('supported', 'unverified', 'nonfactual')),
  "source_claim_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "generated_claims_version_workspace_fk" FOREIGN KEY ("version_id", "workspace_id") REFERENCES "document_versions" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "generated_claims_source_workspace_fk" FOREIGN KEY ("source_claim_id", "workspace_id") REFERENCES "generated_claims" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "generated_claims_offset_bounds" CHECK ("start_offset" >= 0 AND "end_offset" > "start_offset")
);

CREATE TABLE "extraction_batches" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "source_document_id" TEXT NOT NULL,
  "target_career_entry_id" TEXT,
  "method" TEXT NOT NULL CHECK ("method" IN ('deterministic', 'ai')),
  "task_version" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'completed', 'cancelled')),
  "created_by_user_id" TEXT,
  "completed_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "extraction_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "extraction_batches_source_workspace_fk" FOREIGN KEY ("source_document_id", "workspace_id") REFERENCES "source_documents" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "extraction_batches_target_entry_workspace_fk" FOREIGN KEY ("target_career_entry_id", "workspace_id") REFERENCES "career_entries" ("id", "workspace_id") ON DELETE RESTRICT
);

CREATE TABLE "extraction_proposals" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "source_document_id" TEXT NOT NULL,
  "target_career_entry_id" TEXT,
  "proposed_entry_type" TEXT NOT NULL CHECK ("proposed_entry_type" IN ('work', 'internship', 'project', 'research', 'education', 'certification', 'award', 'leadership', 'extracurricular', 'volunteering', 'coursework', 'publication', 'accomplishment', 'metric', 'skill', 'custom')),
  "proposed_entry_title" TEXT NOT NULL,
  "fact_type" TEXT NOT NULL CHECK ("fact_type" IN ('statement', 'metric', 'date', 'skill', 'accomplishment', 'education', 'custom')),
  "proposed_value" TEXT NOT NULL,
  "display_text" TEXT NOT NULL,
  "source_locator" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'approved', 'rejected', 'merged')),
  "duplicate_of_fact_id" TEXT,
  "approved_fact_id" TEXT,
  "resolved_by_user_id" TEXT,
  "resolved_at" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "extraction_proposals_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "extraction_proposals_batch_workspace_fk" FOREIGN KEY ("batch_id", "workspace_id") REFERENCES "extraction_batches" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "extraction_proposals_source_workspace_fk" FOREIGN KEY ("source_document_id", "workspace_id") REFERENCES "source_documents" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "extraction_proposals_target_entry_workspace_fk" FOREIGN KEY ("target_career_entry_id", "workspace_id") REFERENCES "career_entries" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "extraction_proposals_duplicate_fact_workspace_fk" FOREIGN KEY ("duplicate_of_fact_id", "workspace_id") REFERENCES "evidence_facts" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "extraction_proposals_approved_fact_workspace_fk" FOREIGN KEY ("approved_fact_id", "workspace_id") REFERENCES "evidence_facts" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "extraction_proposals_value_object" CHECK (json_type("proposed_value") = 'object'),
  CONSTRAINT "extraction_proposals_locator_object" CHECK (json_type("source_locator") = 'object'),
  CONSTRAINT "extraction_proposals_revision_positive" CHECK ("revision" > 0),
  CONSTRAINT "extraction_proposals_resolution_pair" CHECK (("resolved_at" IS NULL) = ("resolved_by_user_id" IS NULL)),
  CONSTRAINT "extraction_proposals_resolution_state" CHECK (("status" = 'pending' AND "resolved_at" IS NULL AND "approved_fact_id" IS NULL)
          OR ("status" = 'rejected' AND "resolved_at" IS NOT NULL AND "approved_fact_id" IS NULL)
          OR ("status" IN ('approved', 'merged') AND "resolved_at" IS NOT NULL AND "approved_fact_id" IS NOT NULL))
);

CREATE TABLE "rate_limits" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "last_request" INTEGER NOT NULL
);

CREATE TABLE "users" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email_verified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now())
);

CREATE TABLE "workspace_memberships" (
  "workspace_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'owner' CHECK ("role" IN ('owner')),
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "workspace_memberships_pk" PRIMARY KEY ("workspace_id", "user_id"),
  CONSTRAINT "workspace_memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  CONSTRAINT "workspace_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

CREATE TABLE "workspaces" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "owner_user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "deletion_requested_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "workspaces_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT
);

CREATE TABLE "job_posting_revisions" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "job_posting_id" TEXT NOT NULL,
  "parent_revision_id" TEXT,
  "source_document_id" TEXT,
  "input_method" TEXT NOT NULL CHECK ("input_method" IN ('text', 'file', 'url')),
  "revision_number" INTEGER NOT NULL,
  "normalized_text" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "metadata" TEXT NOT NULL DEFAULT '{"schemaVersion":1,"warnings":[]}',
  "created_by_user_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "job_posting_revisions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "job_posting_revisions_posting_workspace_fk" FOREIGN KEY ("job_posting_id", "workspace_id") REFERENCES "job_postings" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "job_posting_revisions_parent_workspace_fk" FOREIGN KEY ("parent_revision_id", "workspace_id") REFERENCES "job_posting_revisions" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "job_posting_revisions_source_workspace_fk" FOREIGN KEY ("source_document_id", "workspace_id") REFERENCES "source_documents" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "job_posting_revisions_number_positive" CHECK ("revision_number" > 0),
  CONSTRAINT "job_posting_revisions_text_not_blank" CHECK (length(trim("normalized_text")) > 0),
  CONSTRAINT "job_posting_revisions_hash_format" CHECK (regexp('^sha256:[0-9a-f]{64}$', "content_hash")),
  CONSTRAINT "job_posting_revisions_metadata_object" CHECK (json_type("metadata") = 'object'),
  CONSTRAINT "job_posting_revisions_source_method" CHECK (("input_method" = 'file') = ("source_document_id" IS NOT NULL))
);

CREATE TABLE "job_postings" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "company" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'archived')),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "archived_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "job_postings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  CONSTRAINT "job_postings_revision_positive" CHECK ("revision" > 0)
);

CREATE TABLE "job_requirement_sets" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "job_posting_revision_id" TEXT NOT NULL,
  "parent_set_id" TEXT,
  "revision_number" INTEGER NOT NULL,
  "method" TEXT NOT NULL CHECK ("method" IN ('manual', 'deterministic', 'ai')),
  "status" TEXT NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft', 'reviewed')),
  "metadata" TEXT NOT NULL,
  "created_by_user_id" TEXT,
  "reviewed_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "job_requirement_sets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  CONSTRAINT "job_requirement_sets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "job_requirement_sets_job_revision_workspace_fk" FOREIGN KEY ("job_posting_revision_id", "workspace_id") REFERENCES "job_posting_revisions" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "job_requirement_sets_parent_workspace_fk" FOREIGN KEY ("parent_set_id", "workspace_id") REFERENCES "job_requirement_sets" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "job_requirement_sets_revision_positive" CHECK ("revision_number" > 0),
  CONSTRAINT "job_requirement_sets_reviewed_state" CHECK (("status" = 'draft' AND "reviewed_at" IS NULL) OR ("status" = 'reviewed' AND "reviewed_at" IS NOT NULL)),
  CONSTRAINT "job_requirement_sets_metadata_object" CHECK (json_type("metadata") = 'object')
);

CREATE TABLE "job_requirements" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "requirement_set_id" TEXT NOT NULL,
  "category" TEXT NOT NULL CHECK ("category" IN ('required_qualification', 'preferred_qualification', 'responsibility', 'keyword', 'seniority', 'ambiguity')),
  "priority" TEXT NOT NULL CHECK ("priority" IN ('required', 'preferred', 'informational')),
  "decision" TEXT NOT NULL DEFAULT 'proposed' CHECK ("decision" IN ('proposed', 'accepted', 'rejected')),
  "requirement_text" TEXT NOT NULL,
  "source_start" INTEGER,
  "source_end" INTEGER,
  "source_text" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "job_requirements_set_workspace_fk" FOREIGN KEY ("requirement_set_id", "workspace_id") REFERENCES "job_requirement_sets" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "job_requirements_text_not_blank" CHECK (length(trim("requirement_text")) > 0),
  CONSTRAINT "job_requirements_source_triplet" CHECK (("source_start" IS NULL AND "source_end" IS NULL AND "source_text" IS NULL) OR ("source_start" >= 0 AND "source_end" > "source_start" AND "source_text" IS NOT NULL AND length("source_text") > 0))
);

CREATE TABLE "job_url_imports" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "operation_id" TEXT NOT NULL,
  "requested_by_user_id" TEXT,
  "title" TEXT NOT NULL,
  "company" TEXT,
  "requested_url" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'succeeded', 'failed')),
  "job_posting_id" TEXT,
  "error_code" TEXT,
  "completed_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "job_url_imports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  CONSTRAINT "job_url_imports_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "job_url_imports_operation_workspace_fk" FOREIGN KEY ("operation_id", "workspace_id") REFERENCES "job_operations" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "job_url_imports_posting_workspace_fk" FOREIGN KEY ("job_posting_id", "workspace_id") REFERENCES "job_postings" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "job_url_imports_terminal_state" CHECK (("status" = 'pending' AND "completed_at" IS NULL AND "job_posting_id" IS NULL AND "error_code" IS NULL)
          OR ("status" = 'succeeded' AND "completed_at" IS NOT NULL AND "job_posting_id" IS NOT NULL AND "error_code" IS NULL)
          OR ("status" = 'failed' AND "completed_at" IS NOT NULL AND "job_posting_id" IS NULL AND "error_code" IS NOT NULL))
);

CREATE TABLE "requirement_evidence_decisions" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "match_id" TEXT NOT NULL,
  "revision_number" INTEGER NOT NULL,
  "decision" TEXT NOT NULL CHECK ("decision" IN ('included', 'excluded')),
  "decided_by_user_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "requirement_evidence_decisions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "requirement_evidence_decisions_match_workspace_fk" FOREIGN KEY ("match_id", "workspace_id") REFERENCES "requirement_evidence_matches" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "requirement_evidence_decisions_revision_positive" CHECK ("revision_number" > 0)
);

CREATE TABLE "requirement_evidence_matches" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "match_run_id" TEXT NOT NULL,
  "requirement_set_id" TEXT NOT NULL,
  "requirement_id" TEXT NOT NULL,
  "evidence_fact_id" TEXT NOT NULL,
  "strength" TEXT NOT NULL CHECK ("strength" IN ('direct', 'combined', 'weak')),
  "score_basis_points" INTEGER NOT NULL,
  "algorithm_version" TEXT NOT NULL,
  "signals" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "requirement_evidence_matches_run_context_fk" FOREIGN KEY ("match_run_id", "workspace_id", "requirement_set_id") REFERENCES "requirement_match_runs" ("id", "workspace_id", "requirement_set_id") ON DELETE CASCADE,
  CONSTRAINT "requirement_evidence_matches_requirement_context_fk" FOREIGN KEY ("requirement_id", "workspace_id", "requirement_set_id") REFERENCES "job_requirements" ("id", "workspace_id", "requirement_set_id") ON DELETE CASCADE,
  CONSTRAINT "requirement_evidence_matches_fact_workspace_fk" FOREIGN KEY ("evidence_fact_id", "workspace_id") REFERENCES "evidence_facts" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "requirement_evidence_matches_score_range" CHECK ("score_basis_points" >= 0 AND "score_basis_points" <= 10000),
  CONSTRAINT "requirement_evidence_matches_signals_object" CHECK (json_type("signals") = 'object')
);

CREATE TABLE "requirement_match_runs" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "requirement_set_id" TEXT NOT NULL,
  "revision_number" INTEGER NOT NULL,
  "algorithm_version" TEXT NOT NULL,
  "input_hash" TEXT NOT NULL,
  "eligible_fact_count" INTEGER NOT NULL,
  "created_by_user_id" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "requirement_match_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  CONSTRAINT "requirement_match_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "requirement_match_runs_set_workspace_fk" FOREIGN KEY ("requirement_set_id", "workspace_id") REFERENCES "job_requirement_sets" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "requirement_match_runs_revision_positive" CHECK ("revision_number" > 0),
  CONSTRAINT "requirement_match_runs_fact_count_nonnegative" CHECK ("eligible_fact_count" >= 0),
  CONSTRAINT "requirement_match_runs_hash_format" CHECK (regexp('^sha256:[0-9a-f]{64}$', "input_hash"))
);

CREATE TABLE "audit_events" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "job_operation_id" TEXT,
  "action" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT,
  "outcome" TEXT NOT NULL CHECK ("outcome" IN ('succeeded', 'denied', 'failed')),
  "correlation_id" TEXT NOT NULL,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "created_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "audit_events_job_operation_workspace_fk" FOREIGN KEY ("job_operation_id", "workspace_id") REFERENCES "job_operations" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "audit_events_metadata_object" CHECK (json_type("metadata") = 'object')
);

CREATE TABLE "job_operations" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "operation_type" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending' CHECK ("state" IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  "idempotency_key" TEXT NOT NULL,
  "input_hash" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "lease_owner" TEXT,
  "lease_expires_at" TEXT,
  "available_at" TEXT NOT NULL DEFAULT (now()),
  "started_at" TEXT,
  "completed_at" TEXT,
  "error_code" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "job_operations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  CONSTRAINT "job_operations_attempt_bounds" CHECK ("attempt" >= 0 AND "max_attempts" > 0 AND "attempt" <= "max_attempts"),
  CONSTRAINT "job_operations_lease_pair" CHECK (("lease_owner" IS NULL) = ("lease_expires_at" IS NULL))
);

CREATE TABLE "model_provider_configurations" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "created_by_user_id" TEXT,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('openai_compatible', 'ollama')),
  "label" TEXT NOT NULL,
  "base_url" TEXT NOT NULL,
  "auth_type" TEXT NOT NULL DEFAULT 'none' CHECK ("auth_type" IN ('none', 'encrypted', 'environment')),
  "credential_ciphertext" TEXT,
  "credential_nonce" TEXT,
  "credential_tag" TEXT,
  "credential_key_version" INTEGER,
  "credential_last_four" TEXT,
  "environment_variable_name" TEXT,
  "capabilities" TEXT NOT NULL DEFAULT '{"schemaVersion":1,"structuredOutput":false,"usage":false,"refusal":false,"warnings":[]}',
  "task_assignments" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'unverified' CHECK ("status" IN ('unverified', 'available', 'unavailable', 'disabled')),
  "last_tested_at" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "model_provider_configurations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  CONSTRAINT "model_provider_configurations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "model_provider_configurations_credential_pair" CHECK (("auth_type" = 'encrypted' AND "credential_ciphertext" IS NOT NULL AND "credential_nonce" IS NOT NULL AND "credential_tag" IS NOT NULL AND "credential_key_version" IS NOT NULL AND "credential_last_four" IS NOT NULL AND "environment_variable_name" IS NULL)
          OR ("auth_type" = 'environment' AND "credential_ciphertext" IS NULL AND "credential_nonce" IS NULL AND "credential_tag" IS NULL AND "credential_key_version" IS NULL AND "credential_last_four" IS NULL AND "environment_variable_name" IS NOT NULL)
          OR ("auth_type" = 'none' AND "credential_ciphertext" IS NULL AND "credential_nonce" IS NULL AND "credential_tag" IS NULL AND "credential_key_version" IS NULL AND "credential_last_four" IS NULL AND "environment_variable_name" IS NULL)),
  CONSTRAINT "model_provider_configurations_capabilities_object" CHECK (json_type("capabilities") = 'object'),
  CONSTRAINT "model_provider_configurations_assignments_object" CHECK (json_type("task_assignments") = 'object'),
  CONSTRAINT "model_provider_configurations_revision_positive" CHECK ("revision" > 0)
);

CREATE TABLE "source_documents" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "uploaded_by_user_id" TEXT,
  "purpose" TEXT NOT NULL CHECK ("purpose" IN ('resume', 'cover_letter', 'job_description', 'career_evidence', 'project_import')),
  "original_name" TEXT NOT NULL,
  "declared_media_type" TEXT NOT NULL,
  "detected_media_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "content_hash" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'quarantined' CHECK ("status" IN ('quarantined', 'processing', 'ready', 'rejected', 'deleted')),
  "extracted_text" TEXT,
  "parse_metadata" TEXT NOT NULL DEFAULT '{"schemaVersion":1}',
  "warnings" TEXT NOT NULL DEFAULT '[]',
  "parser_version" TEXT,
  "error_code" TEXT,
  "processed_at" TEXT,
  "deleted_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "source_documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  CONSTRAINT "source_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "source_documents_size_positive" CHECK ("byte_size" > 0),
  CONSTRAINT "source_documents_hash_format" CHECK (regexp('^sha256:[0-9a-f]{64}$', "content_hash")),
  CONSTRAINT "source_documents_metadata_object" CHECK (json_type("parse_metadata") = 'object')
);

CREATE TABLE "tailoring_claim_candidates" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "suggestion_id" TEXT NOT NULL,
  "start_offset" INTEGER NOT NULL,
  "end_offset" INTEGER NOT NULL,
  "text_hash" TEXT NOT NULL,
  "relation" TEXT NOT NULL CHECK ("relation" IN ('direct', 'combines', 'paraphrases')),
  CONSTRAINT "tailoring_claim_candidates_suggestion_workspace_fk" FOREIGN KEY ("suggestion_id", "workspace_id") REFERENCES "tailoring_suggestions" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "tailoring_claim_candidates_offset_bounds" CHECK ("start_offset" >= 0 AND "end_offset" > "start_offset")
);

CREATE TABLE "tailoring_claim_evidence" (
  "workspace_id" TEXT NOT NULL,
  "claim_candidate_id" TEXT NOT NULL,
  "evidence_fact_id" TEXT NOT NULL,
  CONSTRAINT "tailoring_claim_evidence_claim_candidate_id_evidence_fact_id_pk" PRIMARY KEY ("claim_candidate_id", "evidence_fact_id"),
  CONSTRAINT "tailoring_claim_evidence_claim_workspace_fk" FOREIGN KEY ("claim_candidate_id", "workspace_id") REFERENCES "tailoring_claim_candidates" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "tailoring_claim_evidence_fact_workspace_fk" FOREIGN KEY ("evidence_fact_id", "workspace_id") REFERENCES "evidence_facts" ("id", "workspace_id") ON DELETE RESTRICT
);

CREATE TABLE "tailoring_gaps" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "requirement_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  CONSTRAINT "tailoring_gaps_run_workspace_fk" FOREIGN KEY ("run_id", "workspace_id") REFERENCES "tailoring_runs" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "tailoring_gaps_requirement_workspace_fk" FOREIGN KEY ("requirement_id", "workspace_id") REFERENCES "job_requirements" ("id", "workspace_id") ON DELETE RESTRICT
);

CREATE TABLE "tailoring_run_entries" (
  "workspace_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "career_entry_id" TEXT NOT NULL,
  CONSTRAINT "tailoring_run_entries_run_id_career_entry_id_pk" PRIMARY KEY ("run_id", "career_entry_id"),
  CONSTRAINT "tailoring_run_entries_run_workspace_fk" FOREIGN KEY ("run_id", "workspace_id") REFERENCES "tailoring_runs" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "tailoring_run_entries_entry_workspace_fk" FOREIGN KEY ("career_entry_id", "workspace_id") REFERENCES "career_entries" ("id", "workspace_id") ON DELETE RESTRICT
);

CREATE TABLE "tailoring_run_evidence" (
  "workspace_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "evidence_fact_id" TEXT NOT NULL,
  CONSTRAINT "tailoring_run_evidence_run_id_evidence_fact_id_pk" PRIMARY KEY ("run_id", "evidence_fact_id"),
  CONSTRAINT "tailoring_run_evidence_run_workspace_fk" FOREIGN KEY ("run_id", "workspace_id") REFERENCES "tailoring_runs" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "tailoring_run_evidence_fact_workspace_fk" FOREIGN KEY ("evidence_fact_id", "workspace_id") REFERENCES "evidence_facts" ("id", "workspace_id") ON DELETE RESTRICT
);

CREATE TABLE "tailoring_runs" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('resume', 'cover_letter')),
  "document_id" TEXT NOT NULL,
  "base_version_id" TEXT NOT NULL,
  "job_posting_revision_id" TEXT NOT NULL,
  "requirement_set_id" TEXT NOT NULL,
  "match_run_id" TEXT NOT NULL,
  "provider_configuration_id" TEXT,
  "model" TEXT,
  "status" TEXT NOT NULL DEFAULT 'generating' CHECK ("status" IN ('generating', 'ready', 'failed', 'completed', 'discarded')),
  "idempotency_key" TEXT NOT NULL,
  "manifest" TEXT NOT NULL,
  "failure_code" TEXT,
  "created_by_user_id" TEXT,
  "completed_at" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "tailoring_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  CONSTRAINT "tailoring_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "tailoring_runs_document_workspace_fk" FOREIGN KEY ("document_id", "workspace_id") REFERENCES "documents" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "tailoring_runs_base_version_workspace_fk" FOREIGN KEY ("base_version_id", "workspace_id") REFERENCES "document_versions" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "tailoring_runs_job_revision_workspace_fk" FOREIGN KEY ("job_posting_revision_id", "workspace_id") REFERENCES "job_posting_revisions" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "tailoring_runs_requirement_set_workspace_fk" FOREIGN KEY ("requirement_set_id", "workspace_id") REFERENCES "job_requirement_sets" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "tailoring_runs_match_context_fk" FOREIGN KEY ("match_run_id", "workspace_id", "requirement_set_id") REFERENCES "requirement_match_runs" ("id", "workspace_id", "requirement_set_id") ON DELETE RESTRICT,
  CONSTRAINT "tailoring_runs_provider_workspace_fk" FOREIGN KEY ("provider_configuration_id", "workspace_id") REFERENCES "model_provider_configurations" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "tailoring_runs_manifest_object" CHECK (json_type("manifest") = 'object'),
  CONSTRAINT "tailoring_runs_terminal_state" CHECK (("status" IN ('generating','ready') AND "completed_at" IS NULL AND "failure_code" IS NULL)
          OR ("status" IN ('completed','discarded') AND "completed_at" IS NOT NULL AND "failure_code" IS NULL)
          OR ("status" = 'failed' AND "completed_at" IS NOT NULL AND "failure_code" IS NOT NULL)),
  CONSTRAINT "tailoring_runs_provider_model_pair" CHECK (("provider_configuration_id" IS NULL) = ("model" IS NULL))
);

CREATE TABLE "tailoring_suggestion_requirements" (
  "workspace_id" TEXT NOT NULL,
  "suggestion_id" TEXT NOT NULL,
  "requirement_id" TEXT NOT NULL,
  CONSTRAINT "tailoring_suggestion_requirements_suggestion_id_requirement_id_pk" PRIMARY KEY ("suggestion_id", "requirement_id"),
  CONSTRAINT "tailoring_suggestion_requirements_suggestion_workspace_fk" FOREIGN KEY ("suggestion_id", "workspace_id") REFERENCES "tailoring_suggestions" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "tailoring_suggestion_requirements_requirement_workspace_fk" FOREIGN KEY ("requirement_id", "workspace_id") REFERENCES "job_requirements" ("id", "workspace_id") ON DELETE RESTRICT
);

CREATE TABLE "tailoring_suggestions" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "operation" TEXT NOT NULL CHECK ("operation" IN ('replace_block_text', 'add_block_after', 'remove_block')),
  "target_section_id" TEXT NOT NULL,
  "target_block_id" TEXT,
  "base_block_hash" TEXT,
  "before_text" TEXT,
  "after_text" TEXT,
  "rationale" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "task_version" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'blocked', 'accepted', 'rejected')),
  "blocked_code" TEXT,
  "decided_by_user_id" TEXT,
  "decided_at" TEXT,
  "accepted_version_id" TEXT,
  "edited_text_hash" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "tailoring_suggestions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "tailoring_suggestions_run_workspace_fk" FOREIGN KEY ("run_id", "workspace_id") REFERENCES "tailoring_runs" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "tailoring_suggestions_version_workspace_fk" FOREIGN KEY ("accepted_version_id", "workspace_id") REFERENCES "document_versions" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "tailoring_suggestions_replace_fields" CHECK (("operation" <> 'replace_block_text') OR ("target_block_id" IS NOT NULL AND "base_block_hash" IS NOT NULL AND "before_text" IS NOT NULL AND "after_text" IS NOT NULL)),
  CONSTRAINT "tailoring_suggestions_blocked_pair" CHECK (("status" = 'blocked') = ("blocked_code" IS NOT NULL)),
  CONSTRAINT "tailoring_suggestions_decision_state" CHECK (("status" IN ('pending','blocked') AND "decided_at" IS NULL AND "decided_by_user_id" IS NULL AND "accepted_version_id" IS NULL)
          OR ("status" = 'accepted' AND "decided_at" IS NOT NULL AND "accepted_version_id" IS NOT NULL)
          OR ("status" = 'rejected' AND "decided_at" IS NOT NULL AND "accepted_version_id" IS NULL)),
  CONSTRAINT "tailoring_suggestions_edited_hash" CHECK ("edited_text_hash" IS NULL OR regexp('^sha256:[0-9a-f]{64}$', "edited_text_hash"))
);

CREATE TABLE "tailoring_task_results" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "task_id" TEXT NOT NULL,
  "task_version" TEXT NOT NULL,
  "provider_kind" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL,
  "input_hash" TEXT NOT NULL,
  "output_hash" TEXT NOT NULL,
  "usage" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "tailoring_task_results_run_workspace_fk" FOREIGN KEY ("run_id", "workspace_id") REFERENCES "tailoring_runs" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "tailoring_task_results_attempts_positive" CHECK ("attempts" > 0),
  CONSTRAINT "tailoring_task_results_hashes" CHECK (regexp('^sha256:[0-9a-f]{64}$', "input_hash") AND regexp('^sha256:[0-9a-f]{64}$', "output_hash")),
  CONSTRAINT "tailoring_task_results_objects" CHECK (json_type("usage") = 'object' AND json_type("result") = 'object')
);

CREATE TABLE "ats_category_scores" (
  "workspace_id" TEXT NOT NULL,
  "report_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "weight" INTEGER NOT NULL,
  "earned_points" INTEGER NOT NULL,
  "applicable_points" INTEGER NOT NULL,
  "score_basis_points" INTEGER,
  CONSTRAINT "ats_category_scores_report_id_category_pk" PRIMARY KEY ("report_id", "category"),
  CONSTRAINT "ats_category_scores_report_workspace_fk" FOREIGN KEY ("report_id", "workspace_id") REFERENCES "ats_reports" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "ats_category_scores_bounds" CHECK ("weight" > 0 AND "earned_points" >= 0 AND "applicable_points" >= 0 AND "earned_points" <= "applicable_points" AND ("score_basis_points" IS NULL OR "score_basis_points" BETWEEN 0 AND 10000))
);

CREATE TABLE "ats_findings" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "report_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "rule_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "location" TEXT NOT NULL,
  "measured" TEXT NOT NULL,
  "threshold" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "remediation" TEXT NOT NULL,
  "point_loss_basis_points" INTEGER NOT NULL,
  "blocker" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ats_findings_report_workspace_fk" FOREIGN KEY ("report_id", "workspace_id") REFERENCES "ats_reports" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "ats_findings_point_bounds" CHECK ("point_loss_basis_points" BETWEEN 0 AND 10000),
  CONSTRAINT "ats_findings_objects" CHECK (json_type("location")='object' AND json_type("measured")='object' AND json_type("threshold")='object')
);

CREATE TABLE "ats_reports" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "document_version_id" TEXT NOT NULL,
  "job_posting_revision_id" TEXT,
  "requirement_set_id" TEXT,
  "ruleset_version" TEXT NOT NULL,
  "document_hash" TEXT NOT NULL,
  "job_hash" TEXT,
  "input_hash" TEXT NOT NULL,
  "evaluated_weight" INTEGER NOT NULL,
  "overall_score_basis_points" INTEGER,
  "blocker_count" INTEGER NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "ats_reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  CONSTRAINT "ats_reports_version_workspace_fk" FOREIGN KEY ("document_version_id", "workspace_id") REFERENCES "document_versions" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "ats_reports_job_revision_workspace_fk" FOREIGN KEY ("job_posting_revision_id", "workspace_id") REFERENCES "job_posting_revisions" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "ats_reports_requirement_set_workspace_fk" FOREIGN KEY ("requirement_set_id", "workspace_id") REFERENCES "job_requirement_sets" ("id", "workspace_id") ON DELETE RESTRICT,
  CONSTRAINT "ats_reports_hashes" CHECK (regexp('^sha256:[0-9a-f]{64}$', "document_hash") AND regexp('^sha256:[0-9a-f]{64}$', "input_hash") AND ("job_hash" IS NULL OR regexp('^sha256:[0-9a-f]{64}$', "job_hash"))),
  CONSTRAINT "ats_reports_score_bounds" CHECK ("evaluated_weight" BETWEEN 0 AND 100 AND ("overall_score_basis_points" IS NULL OR "overall_score_basis_points" BETWEEN 0 AND 10000) AND "blocker_count" >= 0),
  CONSTRAINT "ats_reports_context_pair" CHECK (("job_posting_revision_id" IS NULL) = ("requirement_set_id" IS NULL) AND ("job_posting_revision_id" IS NULL) = ("job_hash" IS NULL))
);

CREATE TABLE "export_artifacts" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "document_version_id" TEXT NOT NULL,
  "requested_by_user_id" TEXT,
  "format" TEXT NOT NULL CHECK ("format" IN ('pdf', 'docx', 'markdown', 'text', 'json')),
  "classification" TEXT NOT NULL CHECK ("classification" IN ('final', 'draft')),
  "media_type" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "content_hash" TEXT NOT NULL,
  "input_hash" TEXT NOT NULL,
  "manifest" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "export_artifacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  CONSTRAINT "export_artifacts_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  CONSTRAINT "export_artifacts_version_workspace_fk" FOREIGN KEY ("document_version_id", "workspace_id") REFERENCES "document_versions" ("id", "workspace_id") ON DELETE CASCADE,
  CONSTRAINT "export_artifacts_hashes" CHECK (regexp('^sha256:[0-9a-f]{64}$', "content_hash") AND regexp('^sha256:[0-9a-f]{64}$', "input_hash")),
  CONSTRAINT "export_artifacts_size_bounds" CHECK ("byte_size" > 0 AND "byte_size" <= 10485760),
  CONSTRAINT "export_artifacts_filename_safe" CHECK (length("filename") BETWEEN 1 AND 180 AND instr("filename", '/')=0 AND instr("filename", char(92))=0 AND instr("filename", char(10))=0 AND instr("filename", char(13))=0),
  CONSTRAINT "export_artifacts_manifest_object" CHECK (json_type("manifest")='object'),
  CONSTRAINT "export_artifacts_draft_format" CHECK ("classification"='final' OR "format" IN ('markdown','text','json')),
  CONSTRAINT "export_artifacts_expiry_after_creation" CHECK ("expires_at" > "created_at")
);

CREATE TABLE "workspace_deletion_operations" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL,
  "requester_user_hash" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending' CHECK ("state" IN ('pending', 'running', 'succeeded', 'failed')),
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "backup_expires_at" TEXT NOT NULL,
  "deleted_counts" TEXT NOT NULL DEFAULT '{}',
  "error_code" TEXT,
  "requested_at" TEXT NOT NULL DEFAULT (now()),
  "started_at" TEXT,
  "completed_at" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (now()),
  CONSTRAINT "workspace_deletion_operations_attempt_nonnegative" CHECK ("attempt" >= 0),
  CONSTRAINT "workspace_deletion_operations_counts_object" CHECK (json_type("deleted_counts") = 'object'),
  CONSTRAINT "workspace_deletion_operations_backup_window" CHECK ("backup_expires_at" <= date_add("requested_at", 2592000000))
);

CREATE UNIQUE INDEX "career_profiles_workspace_unique" ON "career_profiles" ("workspace_id");
CREATE UNIQUE INDEX "career_profiles_id_workspace_unique" ON "career_profiles" ("id", "workspace_id");
CREATE UNIQUE INDEX "career_entries_id_workspace_unique" ON "career_entries" ("id", "workspace_id");
CREATE INDEX "career_entries_workspace_status_type_idx" ON "career_entries" ("workspace_id", "status", "type");
CREATE INDEX "career_entries_workspace_status_updated_idx" ON "career_entries" ("workspace_id", "status", "updated_at", "id");
CREATE INDEX "career_entries_duplicate_lookup_idx" ON "career_entries" ("workspace_id", lower("title"), coalesce(lower("organization"), ''));
CREATE INDEX "career_entries_tags_idx" ON "career_entries" ("tags");
CREATE INDEX "career_entry_skills_workspace_idx" ON "career_entry_skills" ("workspace_id");
CREATE UNIQUE INDEX "evidence_facts_id_workspace_unique" ON "evidence_facts" ("id", "workspace_id");
CREATE INDEX "evidence_facts_workspace_status_idx" ON "evidence_facts" ("workspace_id", "status", "type");
CREATE INDEX "evidence_facts_entry_status_idx" ON "evidence_facts" ("workspace_id", "career_entry_id", "status");
CREATE UNIQUE INDEX "fact_proposals_id_workspace_unique" ON "fact_proposals" ("id", "workspace_id");
CREATE INDEX "fact_proposals_workspace_status_idx" ON "fact_proposals" ("workspace_id", "status", "created_at");
CREATE INDEX "fact_proposals_entry_status_idx" ON "fact_proposals" ("workspace_id", "career_entry_id", "status");
CREATE UNIQUE INDEX "skills_workspace_canonical_unique" ON "skills" ("workspace_id", "canonical_name");
CREATE UNIQUE INDEX "skills_id_workspace_unique" ON "skills" ("id", "workspace_id");
CREATE INDEX "skills_workspace_display_idx" ON "skills" ("workspace_id", "display_name");
CREATE UNIQUE INDEX "document_drafts_document_user_unique" ON "document_drafts" ("document_id", "user_id");
CREATE UNIQUE INDEX "document_locks_target_unique" ON "document_locks" ("document_id", "target_type", "target_id");
CREATE UNIQUE INDEX "document_sections_version_stable_unique" ON "document_sections" ("version_id", "stable_section_id");
CREATE UNIQUE INDEX "document_sections_version_position_unique" ON "document_sections" ("version_id", "position");
CREATE UNIQUE INDEX "document_versions_id_workspace_unique" ON "document_versions" ("id", "workspace_id");
CREATE INDEX "document_versions_document_hash_idx" ON "document_versions" ("document_id", "content_hash");
CREATE INDEX "document_versions_document_created_idx" ON "document_versions" ("document_id", "created_at");
CREATE UNIQUE INDEX "documents_id_workspace_unique" ON "documents" ("id", "workspace_id");
CREATE INDEX "documents_workspace_kind_status_idx" ON "documents" ("workspace_id", "kind", "status");
CREATE UNIQUE INDEX "generated_claims_id_workspace_unique" ON "generated_claims" ("id", "workspace_id");
CREATE INDEX "generated_claims_version_status_idx" ON "generated_claims" ("version_id", "status");
CREATE UNIQUE INDEX "extraction_batches_id_workspace_unique" ON "extraction_batches" ("id", "workspace_id");
CREATE INDEX "extraction_batches_source_status_idx" ON "extraction_batches" ("source_document_id", "status", "created_at");
CREATE UNIQUE INDEX "extraction_batches_one_pending_source_unique" ON "extraction_batches" ("workspace_id", "source_document_id") WHERE "status" = 'pending';
CREATE UNIQUE INDEX "extraction_proposals_id_workspace_unique" ON "extraction_proposals" ("id", "workspace_id");
CREATE INDEX "extraction_proposals_batch_status_idx" ON "extraction_proposals" ("batch_id", "status", "created_at");
CREATE UNIQUE INDEX "rate_limits_key_unique" ON "rate_limits" ("key");
CREATE UNIQUE INDEX "users_email_unique" ON "users" ("email");
CREATE UNIQUE INDEX "workspace_memberships_user_unique" ON "workspace_memberships" ("user_id");
CREATE INDEX "workspaces_owner_user_idx" ON "workspaces" ("owner_user_id");
CREATE UNIQUE INDEX "job_posting_revisions_id_workspace_unique" ON "job_posting_revisions" ("id", "workspace_id");
CREATE UNIQUE INDEX "job_posting_revisions_number_unique" ON "job_posting_revisions" ("job_posting_id", "revision_number");
CREATE INDEX "job_posting_revisions_job_created_idx" ON "job_posting_revisions" ("job_posting_id", "created_at");
CREATE UNIQUE INDEX "job_postings_id_workspace_unique" ON "job_postings" ("id", "workspace_id");
CREATE INDEX "job_postings_workspace_status_created_idx" ON "job_postings" ("workspace_id", "status", "created_at");
CREATE UNIQUE INDEX "job_requirement_sets_id_workspace_unique" ON "job_requirement_sets" ("id", "workspace_id");
CREATE UNIQUE INDEX "job_requirement_sets_revision_unique" ON "job_requirement_sets" ("job_posting_revision_id", "revision_number");
CREATE INDEX "job_requirement_sets_job_status_idx" ON "job_requirement_sets" ("job_posting_revision_id", "status", "created_at");
CREATE UNIQUE INDEX "job_requirements_id_workspace_unique" ON "job_requirements" ("id", "workspace_id");
CREATE UNIQUE INDEX "job_requirements_id_workspace_set_unique" ON "job_requirements" ("id", "workspace_id", "requirement_set_id");
CREATE INDEX "job_requirements_set_category_idx" ON "job_requirements" ("requirement_set_id", "category", "decision");
CREATE UNIQUE INDEX "job_url_imports_id_workspace_unique" ON "job_url_imports" ("id", "workspace_id");
CREATE UNIQUE INDEX "job_url_imports_operation_unique" ON "job_url_imports" ("operation_id");
CREATE INDEX "job_url_imports_workspace_status_created_idx" ON "job_url_imports" ("workspace_id", "status", "created_at");
CREATE UNIQUE INDEX "requirement_evidence_decisions_match_revision_unique" ON "requirement_evidence_decisions" ("match_id", "revision_number");
CREATE INDEX "requirement_evidence_decisions_workspace_created_idx" ON "requirement_evidence_decisions" ("workspace_id", "created_at");
CREATE UNIQUE INDEX "requirement_evidence_matches_id_workspace_unique" ON "requirement_evidence_matches" ("id", "workspace_id");
CREATE UNIQUE INDEX "requirement_evidence_matches_candidate_unique" ON "requirement_evidence_matches" ("match_run_id", "requirement_id", "evidence_fact_id");
CREATE INDEX "requirement_evidence_matches_requirement_score_idx" ON "requirement_evidence_matches" ("requirement_id", "score_basis_points");
CREATE UNIQUE INDEX "requirement_match_runs_id_workspace_unique" ON "requirement_match_runs" ("id", "workspace_id");
CREATE UNIQUE INDEX "requirement_match_runs_context_unique" ON "requirement_match_runs" ("id", "workspace_id", "requirement_set_id");
CREATE UNIQUE INDEX "requirement_match_runs_revision_unique" ON "requirement_match_runs" ("requirement_set_id", "revision_number");
CREATE INDEX "requirement_match_runs_set_created_idx" ON "requirement_match_runs" ("requirement_set_id", "created_at");
CREATE INDEX "audit_events_workspace_created_idx" ON "audit_events" ("workspace_id", "created_at");
CREATE INDEX "audit_events_correlation_idx" ON "audit_events" ("correlation_id");
CREATE UNIQUE INDEX "job_operations_workspace_idempotency_unique" ON "job_operations" ("workspace_id", "idempotency_key");
CREATE UNIQUE INDEX "job_operations_id_workspace_unique" ON "job_operations" ("id", "workspace_id");
CREATE INDEX "job_operations_queue_idx" ON "job_operations" ("state", "available_at", "created_at");
CREATE UNIQUE INDEX "model_provider_configurations_id_workspace_unique" ON "model_provider_configurations" ("id", "workspace_id");
CREATE UNIQUE INDEX "model_provider_configurations_workspace_label_unique" ON "model_provider_configurations" ("workspace_id", "label");
CREATE INDEX "model_provider_configurations_workspace_status_idx" ON "model_provider_configurations" ("workspace_id", "status");
CREATE UNIQUE INDEX "source_documents_id_workspace_unique" ON "source_documents" ("id", "workspace_id");
CREATE UNIQUE INDEX "source_documents_storage_key_unique" ON "source_documents" ("storage_key");
CREATE INDEX "source_documents_workspace_status_idx" ON "source_documents" ("workspace_id", "status", "created_at");
CREATE UNIQUE INDEX "tailoring_claim_candidates_id_workspace_unique" ON "tailoring_claim_candidates" ("id", "workspace_id");
CREATE INDEX "tailoring_claim_candidates_suggestion_idx" ON "tailoring_claim_candidates" ("suggestion_id");
CREATE UNIQUE INDEX "tailoring_gaps_run_requirement_unique" ON "tailoring_gaps" ("run_id", "requirement_id", "code");
CREATE UNIQUE INDEX "tailoring_runs_id_workspace_unique" ON "tailoring_runs" ("id", "workspace_id");
CREATE UNIQUE INDEX "tailoring_runs_idempotency_unique" ON "tailoring_runs" ("workspace_id", "idempotency_key");
CREATE INDEX "tailoring_runs_workspace_status_created_idx" ON "tailoring_runs" ("workspace_id", "status", "created_at");
CREATE UNIQUE INDEX "tailoring_suggestions_id_workspace_unique" ON "tailoring_suggestions" ("id", "workspace_id");
CREATE UNIQUE INDEX "tailoring_suggestions_run_sequence_unique" ON "tailoring_suggestions" ("run_id", "sequence");
CREATE INDEX "tailoring_suggestions_run_status_idx" ON "tailoring_suggestions" ("run_id", "status");
CREATE UNIQUE INDEX "tailoring_task_results_id_workspace_unique" ON "tailoring_task_results" ("id", "workspace_id");
CREATE UNIQUE INDEX "tailoring_task_results_run_sequence_unique" ON "tailoring_task_results" ("run_id", "sequence");
CREATE UNIQUE INDEX "ats_findings_report_sequence_unique" ON "ats_findings" ("report_id", "sequence");
CREATE INDEX "ats_findings_report_category_idx" ON "ats_findings" ("report_id", "category");
CREATE UNIQUE INDEX "ats_reports_id_workspace_unique" ON "ats_reports" ("id", "workspace_id");
CREATE UNIQUE INDEX "ats_reports_workspace_input_unique" ON "ats_reports" ("workspace_id", "input_hash");
CREATE INDEX "ats_reports_workspace_created_idx" ON "ats_reports" ("workspace_id", "created_at");
CREATE UNIQUE INDEX "export_artifacts_id_workspace_unique" ON "export_artifacts" ("id", "workspace_id");
CREATE UNIQUE INDEX "export_artifacts_workspace_input_unique" ON "export_artifacts" ("workspace_id", "input_hash");
CREATE UNIQUE INDEX "export_artifacts_storage_key_unique" ON "export_artifacts" ("storage_key");
CREATE INDEX "export_artifacts_workspace_expiry_idx" ON "export_artifacts" ("workspace_id", "expires_at");
CREATE UNIQUE INDEX "workspace_deletion_operations_workspace_unique" ON "workspace_deletion_operations" ("workspace_id");
CREATE INDEX "workspace_deletion_operations_queue_idx" ON "workspace_deletion_operations" ("state", "requested_at");

-- Immutable history and lifecycle guards.
CREATE TRIGGER "document_versions_immutable_update" BEFORE UPDATE ON "document_versions" BEGIN SELECT RAISE(ABORT, 'immutable history cannot be updated'); END;
CREATE TRIGGER "document_sections_immutable_update" BEFORE UPDATE ON "document_sections" BEGIN SELECT RAISE(ABORT, 'immutable history cannot be updated'); END;
CREATE TRIGGER "generated_claims_immutable_update" BEFORE UPDATE ON "generated_claims" BEGIN SELECT RAISE(ABORT, 'immutable history cannot be updated'); END;
CREATE TRIGGER "claim_evidence_immutable_update" BEFORE UPDATE ON "claim_evidence" BEGIN SELECT RAISE(ABORT, 'immutable history cannot be updated'); END;
CREATE TRIGGER "job_posting_revisions_immutable_update" BEFORE UPDATE ON "job_posting_revisions" BEGIN SELECT RAISE(ABORT, 'immutable history cannot be updated'); END;
CREATE TRIGGER "ats_reports_immutable_update" BEFORE UPDATE ON "ats_reports" BEGIN SELECT RAISE(ABORT, 'immutable history cannot be updated'); END;
CREATE TRIGGER "ats_category_scores_immutable_update" BEFORE UPDATE ON "ats_category_scores" BEGIN SELECT RAISE(ABORT, 'immutable history cannot be updated'); END;
CREATE TRIGGER "ats_findings_immutable_update" BEFORE UPDATE ON "ats_findings" BEGIN SELECT RAISE(ABORT, 'immutable history cannot be updated'); END;
CREATE TRIGGER "export_artifacts_immutable_update" BEFORE UPDATE ON "export_artifacts" BEGIN SELECT RAISE(ABORT, 'immutable history cannot be updated'); END;
CREATE TRIGGER "requirement_match_runs_append_only_update" BEFORE UPDATE ON "requirement_match_runs" BEGIN SELECT RAISE(ABORT, 'append-only history cannot be updated'); END;
CREATE TRIGGER "requirement_match_runs_append_only_delete" BEFORE DELETE ON "requirement_match_runs" WHEN workspace_deletion_authorized() = 0 BEGIN SELECT RAISE(ABORT, 'append-only history cannot be deleted'); END;
CREATE TRIGGER "requirement_evidence_matches_append_only_update" BEFORE UPDATE ON "requirement_evidence_matches" BEGIN SELECT RAISE(ABORT, 'append-only history cannot be updated'); END;
CREATE TRIGGER "requirement_evidence_matches_append_only_delete" BEFORE DELETE ON "requirement_evidence_matches" WHEN workspace_deletion_authorized() = 0 BEGIN SELECT RAISE(ABORT, 'append-only history cannot be deleted'); END;
CREATE TRIGGER "requirement_evidence_decisions_append_only_update" BEFORE UPDATE ON "requirement_evidence_decisions" BEGIN SELECT RAISE(ABORT, 'append-only history cannot be updated'); END;
CREATE TRIGGER "requirement_evidence_decisions_append_only_delete" BEFORE DELETE ON "requirement_evidence_decisions" WHEN workspace_deletion_authorized() = 0 BEGIN SELECT RAISE(ABORT, 'append-only history cannot be deleted'); END;
CREATE TRIGGER "tailoring_task_results_append_only_update" BEFORE UPDATE ON "tailoring_task_results" BEGIN SELECT RAISE(ABORT, 'append-only history cannot be updated'); END;
CREATE TRIGGER "tailoring_task_results_append_only_delete" BEFORE DELETE ON "tailoring_task_results" WHEN workspace_deletion_authorized() = 0 BEGIN SELECT RAISE(ABORT, 'append-only history cannot be deleted'); END;
CREATE TRIGGER "extraction_proposals_resolved_immutable" BEFORE UPDATE ON "extraction_proposals" WHEN OLD.status <> 'pending' BEGIN SELECT RAISE(ABORT, 'resolved extraction proposals are immutable'); END;
CREATE TRIGGER "job_url_imports_resolved_immutable" BEFORE UPDATE ON "job_url_imports" WHEN OLD.status <> 'pending' BEGIN SELECT RAISE(ABORT, 'resolved URL imports are immutable'); END;
CREATE TRIGGER "job_requirement_sets_reviewed_update" BEFORE UPDATE ON "job_requirement_sets" WHEN OLD.status = 'reviewed' BEGIN SELECT RAISE(ABORT, 'reviewed requirement sets are immutable'); END;
CREATE TRIGGER "job_requirement_sets_reviewed_delete" BEFORE DELETE ON "job_requirement_sets" WHEN OLD.status = 'reviewed' AND workspace_deletion_authorized() = 0 BEGIN SELECT RAISE(ABORT, 'reviewed requirement sets are immutable'); END;
CREATE TRIGGER "job_requirements_reviewed_update" BEFORE UPDATE ON "job_requirements" WHEN EXISTS (SELECT 1 FROM job_requirement_sets s WHERE s.id=OLD.requirement_set_id AND s.workspace_id=OLD.workspace_id AND s.status='reviewed') BEGIN SELECT RAISE(ABORT, 'reviewed requirements are immutable'); END;
CREATE TRIGGER "job_requirements_reviewed_delete" BEFORE DELETE ON "job_requirements" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM job_requirement_sets s WHERE s.id=OLD.requirement_set_id AND s.workspace_id=OLD.workspace_id AND s.status='reviewed') BEGIN SELECT RAISE(ABORT, 'reviewed requirements are immutable'); END;
CREATE TRIGGER "career_profiles_frozen_insert" BEFORE INSERT ON "career_profiles" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "career_profiles_frozen_update" BEFORE UPDATE ON "career_profiles" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "career_entries_frozen_insert" BEFORE INSERT ON "career_entries" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "career_entries_frozen_update" BEFORE UPDATE ON "career_entries" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "career_entry_skills_frozen_insert" BEFORE INSERT ON "career_entry_skills" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "career_entry_skills_frozen_update" BEFORE UPDATE ON "career_entry_skills" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "career_profile_settings_frozen_insert" BEFORE INSERT ON "career_profile_settings" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "career_profile_settings_frozen_update" BEFORE UPDATE ON "career_profile_settings" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "evidence_facts_frozen_insert" BEFORE INSERT ON "evidence_facts" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "evidence_facts_frozen_update" BEFORE UPDATE ON "evidence_facts" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "fact_proposals_frozen_insert" BEFORE INSERT ON "fact_proposals" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "fact_proposals_frozen_update" BEFORE UPDATE ON "fact_proposals" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "skills_frozen_insert" BEFORE INSERT ON "skills" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "skills_frozen_update" BEFORE UPDATE ON "skills" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "claim_evidence_frozen_insert" BEFORE INSERT ON "claim_evidence" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "claim_evidence_frozen_update" BEFORE UPDATE ON "claim_evidence" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "document_drafts_frozen_insert" BEFORE INSERT ON "document_drafts" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "document_drafts_frozen_update" BEFORE UPDATE ON "document_drafts" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "document_locks_frozen_insert" BEFORE INSERT ON "document_locks" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "document_locks_frozen_update" BEFORE UPDATE ON "document_locks" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "document_sections_frozen_insert" BEFORE INSERT ON "document_sections" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "document_sections_frozen_update" BEFORE UPDATE ON "document_sections" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "document_versions_frozen_insert" BEFORE INSERT ON "document_versions" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "document_versions_frozen_update" BEFORE UPDATE ON "document_versions" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "documents_frozen_insert" BEFORE INSERT ON "documents" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "documents_frozen_update" BEFORE UPDATE ON "documents" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "generated_claims_frozen_insert" BEFORE INSERT ON "generated_claims" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "generated_claims_frozen_update" BEFORE UPDATE ON "generated_claims" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "extraction_batches_frozen_insert" BEFORE INSERT ON "extraction_batches" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "extraction_batches_frozen_update" BEFORE UPDATE ON "extraction_batches" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "extraction_proposals_frozen_insert" BEFORE INSERT ON "extraction_proposals" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "extraction_proposals_frozen_update" BEFORE UPDATE ON "extraction_proposals" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "workspace_memberships_frozen_insert" BEFORE INSERT ON "workspace_memberships" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "workspace_memberships_frozen_update" BEFORE UPDATE ON "workspace_memberships" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "job_posting_revisions_frozen_insert" BEFORE INSERT ON "job_posting_revisions" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "job_posting_revisions_frozen_update" BEFORE UPDATE ON "job_posting_revisions" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "job_postings_frozen_insert" BEFORE INSERT ON "job_postings" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "job_postings_frozen_update" BEFORE UPDATE ON "job_postings" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "job_requirement_sets_frozen_insert" BEFORE INSERT ON "job_requirement_sets" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "job_requirement_sets_frozen_update" BEFORE UPDATE ON "job_requirement_sets" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "job_requirements_frozen_insert" BEFORE INSERT ON "job_requirements" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "job_requirements_frozen_update" BEFORE UPDATE ON "job_requirements" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "job_url_imports_frozen_insert" BEFORE INSERT ON "job_url_imports" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "job_url_imports_frozen_update" BEFORE UPDATE ON "job_url_imports" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "requirement_evidence_decisions_frozen_insert" BEFORE INSERT ON "requirement_evidence_decisions" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "requirement_evidence_decisions_frozen_update" BEFORE UPDATE ON "requirement_evidence_decisions" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "requirement_evidence_matches_frozen_insert" BEFORE INSERT ON "requirement_evidence_matches" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "requirement_evidence_matches_frozen_update" BEFORE UPDATE ON "requirement_evidence_matches" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "requirement_match_runs_frozen_insert" BEFORE INSERT ON "requirement_match_runs" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "requirement_match_runs_frozen_update" BEFORE UPDATE ON "requirement_match_runs" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "audit_events_frozen_insert" BEFORE INSERT ON "audit_events" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "audit_events_frozen_update" BEFORE UPDATE ON "audit_events" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "job_operations_frozen_insert" BEFORE INSERT ON "job_operations" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "job_operations_frozen_update" BEFORE UPDATE ON "job_operations" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "model_provider_configurations_frozen_insert" BEFORE INSERT ON "model_provider_configurations" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "model_provider_configurations_frozen_update" BEFORE UPDATE ON "model_provider_configurations" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "source_documents_frozen_insert" BEFORE INSERT ON "source_documents" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "source_documents_frozen_update" BEFORE UPDATE ON "source_documents" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "tailoring_claim_candidates_frozen_insert" BEFORE INSERT ON "tailoring_claim_candidates" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "tailoring_claim_candidates_frozen_update" BEFORE UPDATE ON "tailoring_claim_candidates" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "tailoring_claim_evidence_frozen_insert" BEFORE INSERT ON "tailoring_claim_evidence" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "tailoring_claim_evidence_frozen_update" BEFORE UPDATE ON "tailoring_claim_evidence" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "tailoring_gaps_frozen_insert" BEFORE INSERT ON "tailoring_gaps" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "tailoring_gaps_frozen_update" BEFORE UPDATE ON "tailoring_gaps" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "tailoring_run_entries_frozen_insert" BEFORE INSERT ON "tailoring_run_entries" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "tailoring_run_entries_frozen_update" BEFORE UPDATE ON "tailoring_run_entries" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "tailoring_run_evidence_frozen_insert" BEFORE INSERT ON "tailoring_run_evidence" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "tailoring_run_evidence_frozen_update" BEFORE UPDATE ON "tailoring_run_evidence" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "tailoring_runs_frozen_insert" BEFORE INSERT ON "tailoring_runs" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "tailoring_runs_frozen_update" BEFORE UPDATE ON "tailoring_runs" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "tailoring_suggestion_requirements_frozen_insert" BEFORE INSERT ON "tailoring_suggestion_requirements" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "tailoring_suggestion_requirements_frozen_update" BEFORE UPDATE ON "tailoring_suggestion_requirements" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "tailoring_suggestions_frozen_insert" BEFORE INSERT ON "tailoring_suggestions" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "tailoring_suggestions_frozen_update" BEFORE UPDATE ON "tailoring_suggestions" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "tailoring_task_results_frozen_insert" BEFORE INSERT ON "tailoring_task_results" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "tailoring_task_results_frozen_update" BEFORE UPDATE ON "tailoring_task_results" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "ats_category_scores_frozen_insert" BEFORE INSERT ON "ats_category_scores" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "ats_category_scores_frozen_update" BEFORE UPDATE ON "ats_category_scores" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "ats_findings_frozen_insert" BEFORE INSERT ON "ats_findings" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "ats_findings_frozen_update" BEFORE UPDATE ON "ats_findings" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "ats_reports_frozen_insert" BEFORE INSERT ON "ats_reports" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "ats_reports_frozen_update" BEFORE UPDATE ON "ats_reports" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "export_artifacts_frozen_insert" BEFORE INSERT ON "export_artifacts" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "export_artifacts_frozen_update" BEFORE UPDATE ON "export_artifacts" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;

CREATE TRIGGER "evidence_facts_content_immutable" BEFORE UPDATE ON "evidence_facts"
WHEN NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.career_entry_id IS NOT OLD.career_entry_id OR NEW.type IS NOT OLD.type OR NEW.value IS NOT OLD.value OR NEW.display_text IS NOT OLD.display_text OR NEW.source_locator IS NOT OLD.source_locator OR NEW.supersedes_fact_id IS NOT OLD.supersedes_fact_id OR NEW.approved_by_user_id IS NOT OLD.approved_by_user_id OR NEW.approved_at IS NOT OLD.approved_at OR NEW.created_at IS NOT OLD.created_at OR OLD.status <> 'approved' OR NEW.status NOT IN ('superseded','withdrawn')
BEGIN SELECT RAISE(ABORT, 'approved evidence content is immutable'); END;

CREATE TRIGGER "model_provider_context_immutable" BEFORE UPDATE ON "model_provider_configurations"
WHEN NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.kind IS NOT OLD.kind
BEGIN SELECT RAISE(ABORT, 'model provider credential context is immutable'); END;

CREATE TRIGGER "job_url_import_request_immutable" BEFORE UPDATE ON "job_url_imports"
WHEN NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.operation_id IS NOT OLD.operation_id OR NEW.requested_by_user_id IS NOT OLD.requested_by_user_id OR NEW.title IS NOT OLD.title OR NEW.company IS NOT OLD.company OR NEW.requested_url IS NOT OLD.requested_url OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'URL import request fields are immutable'); END;

CREATE TRIGGER "tailoring_run_context_immutable" BEFORE UPDATE ON "tailoring_runs"
WHEN NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.kind IS NOT OLD.kind OR NEW.document_id IS NOT OLD.document_id OR NEW.base_version_id IS NOT OLD.base_version_id OR NEW.job_posting_revision_id IS NOT OLD.job_posting_revision_id OR NEW.requirement_set_id IS NOT OLD.requirement_set_id OR NEW.match_run_id IS NOT OLD.match_run_id OR NEW.provider_configuration_id IS NOT OLD.provider_configuration_id OR NEW.model IS NOT OLD.model OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.manifest IS NOT OLD.manifest
BEGIN SELECT RAISE(ABORT, 'tailoring run context is immutable'); END;

CREATE TRIGGER "tailoring_suggestion_content_immutable" BEFORE UPDATE ON "tailoring_suggestions"
WHEN NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.run_id IS NOT OLD.run_id OR NEW.sequence IS NOT OLD.sequence OR NEW.operation IS NOT OLD.operation OR NEW.target_section_id IS NOT OLD.target_section_id OR NEW.target_block_id IS NOT OLD.target_block_id OR NEW.base_block_hash IS NOT OLD.base_block_hash OR NEW.before_text IS NOT OLD.before_text OR NEW.after_text IS NOT OLD.after_text OR NEW.rationale IS NOT OLD.rationale OR NEW.task_id IS NOT OLD.task_id OR NEW.task_version IS NOT OLD.task_version
BEGIN SELECT RAISE(ABORT, 'tailoring suggestion content is immutable'); END;

PRAGMA foreign_keys = ON;
