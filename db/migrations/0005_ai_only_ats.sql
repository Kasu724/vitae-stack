-- Preserve historical deterministic ATS reports, but add the immutable AI task
-- provenance required for all newly generated ATS analyses.
ALTER TABLE "ats_reports" ADD COLUMN "analysis_summary" TEXT;
ALTER TABLE "ats_reports" ADD COLUMN "overall_rationale" TEXT;
ALTER TABLE "ats_reports" ADD COLUMN "provider_configuration_id" TEXT;
ALTER TABLE "ats_reports" ADD COLUMN "model" TEXT;
ALTER TABLE "ats_reports" ADD COLUMN "task_version" TEXT;
ALTER TABLE "ats_reports" ADD COLUMN "attempts" INTEGER;
ALTER TABLE "ats_reports" ADD COLUMN "output_hash" TEXT;

ALTER TABLE "source_ats_reports" ADD COLUMN "analysis_summary" TEXT;
ALTER TABLE "source_ats_reports" ADD COLUMN "overall_rationale" TEXT;
ALTER TABLE "source_ats_reports" ADD COLUMN "provider_configuration_id" TEXT;
ALTER TABLE "source_ats_reports" ADD COLUMN "model" TEXT;
ALTER TABLE "source_ats_reports" ADD COLUMN "task_version" TEXT;
ALTER TABLE "source_ats_reports" ADD COLUMN "attempts" INTEGER;
ALTER TABLE "source_ats_reports" ADD COLUMN "output_hash" TEXT;

ALTER TABLE "ats_category_scores" ADD COLUMN "rationale" TEXT;
ALTER TABLE "source_ats_category_scores" ADD COLUMN "rationale" TEXT;

CREATE INDEX "ats_reports_provider_configuration_idx" ON "ats_reports" ("workspace_id", "provider_configuration_id");
CREATE INDEX "source_ats_reports_provider_configuration_idx" ON "source_ats_reports" ("workspace_id", "provider_configuration_id");
