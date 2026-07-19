-- ATS analysis of an uploaded resume is deliberately separate from a saved
-- document report. The source remains immutable input and never gains claims
-- or export eligibility merely by being scored.
CREATE TABLE "source_ats_reports" (
  "id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
  "workspace_id" TEXT NOT NULL, "source_document_id" TEXT NOT NULL, "job_posting_revision_id" TEXT, "requirement_set_id" TEXT,
  "ruleset_version" TEXT NOT NULL, "document_hash" TEXT NOT NULL, "job_hash" TEXT, "input_hash" TEXT NOT NULL,
  "evaluated_weight" INTEGER NOT NULL, "overall_score_basis_points" INTEGER, "blocker_count" INTEGER NOT NULL, "created_at" TEXT NOT NULL DEFAULT (now()),
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("source_document_id", "workspace_id") REFERENCES "source_documents" ("id", "workspace_id") ON DELETE RESTRICT,
  FOREIGN KEY ("job_posting_revision_id", "workspace_id") REFERENCES "job_posting_revisions" ("id", "workspace_id") ON DELETE RESTRICT,
  FOREIGN KEY ("requirement_set_id", "workspace_id") REFERENCES "job_requirement_sets" ("id", "workspace_id") ON DELETE RESTRICT,
  CHECK (regexp('^sha256:[0-9a-f]{64}$', "document_hash") AND regexp('^sha256:[0-9a-f]{64}$', "input_hash") AND ("job_hash" IS NULL OR regexp('^sha256:[0-9a-f]{64}$', "job_hash"))),
  CHECK ("evaluated_weight" BETWEEN 0 AND 100 AND ("overall_score_basis_points" IS NULL OR "overall_score_basis_points" BETWEEN 0 AND 10000) AND "blocker_count" >= 0),
  CHECK (("job_posting_revision_id" IS NULL) = ("requirement_set_id" IS NULL) AND ("job_posting_revision_id" IS NULL) = ("job_hash" IS NULL))
);
CREATE TABLE "source_ats_category_scores" ("workspace_id" TEXT NOT NULL, "report_id" TEXT NOT NULL, "category" TEXT NOT NULL, "label" TEXT NOT NULL, "weight" INTEGER NOT NULL, "earned_points" INTEGER NOT NULL, "applicable_points" INTEGER NOT NULL, "score_basis_points" INTEGER, PRIMARY KEY ("report_id", "category"), FOREIGN KEY ("report_id", "workspace_id") REFERENCES "source_ats_reports" ("id", "workspace_id") ON DELETE CASCADE);
CREATE TABLE "source_ats_findings" ("id" TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))), "workspace_id" TEXT NOT NULL, "report_id" TEXT NOT NULL, "sequence" INTEGER NOT NULL, "rule_id" TEXT NOT NULL, "category" TEXT NOT NULL, "severity" TEXT NOT NULL, "location" TEXT NOT NULL, "measured" TEXT NOT NULL, "threshold" TEXT NOT NULL, "message" TEXT NOT NULL, "remediation" TEXT NOT NULL, "point_loss_basis_points" INTEGER NOT NULL, "blocker" INTEGER NOT NULL DEFAULT 0, FOREIGN KEY ("report_id", "workspace_id") REFERENCES "source_ats_reports" ("id", "workspace_id") ON DELETE CASCADE);
CREATE UNIQUE INDEX "source_ats_reports_id_workspace_unique" ON "source_ats_reports" ("id", "workspace_id");
CREATE UNIQUE INDEX "source_ats_reports_workspace_input_unique" ON "source_ats_reports" ("workspace_id", "input_hash");
CREATE INDEX "source_ats_reports_workspace_created_idx" ON "source_ats_reports" ("workspace_id", "created_at");
CREATE INDEX "source_ats_findings_report_category_idx" ON "source_ats_findings" ("report_id", "category");
CREATE TRIGGER "source_ats_reports_immutable_update" BEFORE UPDATE ON "source_ats_reports" BEGIN SELECT RAISE(ABORT, 'immutable history cannot be updated'); END;
CREATE TRIGGER "source_ats_category_scores_immutable_update" BEFORE UPDATE ON "source_ats_category_scores" BEGIN SELECT RAISE(ABORT, 'immutable history cannot be updated'); END;
CREATE TRIGGER "source_ats_findings_immutable_update" BEFORE UPDATE ON "source_ats_findings" BEGIN SELECT RAISE(ABORT, 'immutable history cannot be updated'); END;
CREATE TRIGGER "source_ats_reports_immutable_delete" BEFORE DELETE ON "source_ats_reports" WHEN workspace_deletion_authorized() = 0 BEGIN SELECT RAISE(ABORT, 'immutable history cannot be deleted'); END;
CREATE TRIGGER "source_ats_category_scores_immutable_delete" BEFORE DELETE ON "source_ats_category_scores" WHEN workspace_deletion_authorized() = 0 BEGIN SELECT RAISE(ABORT, 'immutable history cannot be deleted'); END;
CREATE TRIGGER "source_ats_findings_immutable_delete" BEFORE DELETE ON "source_ats_findings" WHEN workspace_deletion_authorized() = 0 BEGIN SELECT RAISE(ABORT, 'immutable history cannot be deleted'); END;
CREATE TRIGGER "source_ats_reports_context_insert" BEFORE INSERT ON "source_ats_reports" WHEN NOT EXISTS (SELECT 1 FROM source_documents s WHERE s.id=NEW.source_document_id AND s.workspace_id=NEW.workspace_id AND s.status='ready' AND s.purpose='resume' AND s.content_hash=NEW.document_hash) OR (NEW.requirement_set_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM job_requirement_sets s JOIN job_posting_revisions r ON r.id=NEW.job_posting_revision_id AND r.workspace_id=NEW.workspace_id AND r.content_hash=NEW.job_hash WHERE s.id=NEW.requirement_set_id AND s.workspace_id=NEW.workspace_id AND s.job_posting_revision_id=r.id)) BEGIN SELECT RAISE(ABORT, 'source ATS report context mismatch'); END;
CREATE TRIGGER "source_ats_reports_frozen_insert" BEFORE INSERT ON "source_ats_reports" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=NEW.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
CREATE TRIGGER "source_ats_reports_frozen_delete" BEFORE DELETE ON "source_ats_reports" WHEN workspace_deletion_authorized() = 0 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id=OLD.workspace_id AND w.deletion_requested_at IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'workspace pending deletion'); END;
