-- Add provenance metadata and independent proposal grouping for optional AI-01
-- extraction without weakening workspace/source ownership checks.

ALTER TABLE "extraction_batches"
  ADD COLUMN "metadata" TEXT NOT NULL DEFAULT '{}';

ALTER TABLE "extraction_proposals"
  ADD COLUMN "proposed_entry_key" TEXT;

CREATE INDEX "extraction_proposals_batch_entry_key_idx"
  ON "extraction_proposals" ("batch_id", "proposed_entry_key", "created_at");

DROP TRIGGER IF EXISTS "extraction_proposals_batch_context_insert";
DROP TRIGGER IF EXISTS "extraction_proposals_batch_context_update";

CREATE TRIGGER "extraction_proposals_batch_context_insert"
BEFORE INSERT ON "extraction_proposals"
WHEN NOT EXISTS (
  SELECT 1
  FROM extraction_batches b
  WHERE b.id = NEW.batch_id
    AND b.workspace_id = NEW.workspace_id
    AND b.source_document_id = NEW.source_document_id
)
BEGIN
  SELECT RAISE(ABORT, 'extraction proposal batch context mismatch');
END;

CREATE TRIGGER "extraction_proposals_batch_context_update"
BEFORE UPDATE OF batch_id, source_document_id, target_career_entry_id
ON "extraction_proposals"
WHEN NOT EXISTS (
  SELECT 1
  FROM extraction_batches b
  WHERE b.id = NEW.batch_id
    AND b.workspace_id = NEW.workspace_id
    AND b.source_document_id = NEW.source_document_id
)
BEGIN
  SELECT RAISE(ABORT, 'extraction proposal batch context mismatch');
END;

CREATE TRIGGER "extraction_batches_metadata_insert"
BEFORE INSERT ON "extraction_batches"
WHEN json_type(NEW.metadata) <> 'object'
BEGIN
  SELECT RAISE(ABORT, 'extraction metadata must be an object');
END;

CREATE TRIGGER "extraction_batches_metadata_update"
BEFORE UPDATE OF metadata ON "extraction_batches"
WHEN json_type(NEW.metadata) <> 'object'
BEGIN
  SELECT RAISE(ABORT, 'extraction metadata must be an object');
END;

CREATE TRIGGER "extraction_proposals_entry_key_insert"
BEFORE INSERT ON "extraction_proposals"
WHEN (
  NEW.proposed_entry_key IS NOT NULL
  AND NOT regexp('^[A-Za-z0-9_-]{1,64}$', NEW.proposed_entry_key)
) OR (
  NEW.proposed_entry_key IS NULL
  AND EXISTS (
    SELECT 1
    FROM extraction_batches b
    WHERE b.id = NEW.batch_id
      AND b.workspace_id = NEW.workspace_id
      AND b.method = 'ai'
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid extraction proposal entry key');
END;

CREATE TRIGGER "extraction_proposals_entry_key_update"
BEFORE UPDATE OF proposed_entry_key ON "extraction_proposals"
WHEN (
  NEW.proposed_entry_key IS NOT NULL
  AND NOT regexp('^[A-Za-z0-9_-]{1,64}$', NEW.proposed_entry_key)
) OR (
  NEW.proposed_entry_key IS NULL
  AND EXISTS (
    SELECT 1
    FROM extraction_batches b
    WHERE b.id = NEW.batch_id
      AND b.workspace_id = NEW.workspace_id
      AND b.method = 'ai'
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid extraction proposal entry key');
END;
