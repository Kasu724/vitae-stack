CREATE OR REPLACE FUNCTION workspace_deletion_is_authorized(target_workspace uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_setting('vitae.workspace_deletion', true) = 'on'
    AND EXISTS (
      SELECT 1
      FROM workspace_deletion_operations operation
      JOIN workspaces workspace ON workspace.id = operation.workspace_id
      WHERE operation.workspace_id = target_workspace
        AND operation.state = 'running'
        AND workspace.deletion_requested_at IS NOT NULL
    );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_frozen_workspace_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scoped_workspace uuid;
BEGIN
  IF workspace_deletion_is_authorized(NEW.workspace_id) THEN
    RETURN NEW;
  END IF;
  scoped_workspace := NEW.workspace_id;
  IF EXISTS (
    SELECT 1 FROM workspaces
    WHERE id = scoped_workspace AND deletion_requested_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'workspace is frozen for deletion' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_reviewed_requirement_set()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF workspace_deletion_is_authorized(OLD.workspace_id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
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
CREATE OR REPLACE FUNCTION protect_reviewed_requirement()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  set_status job_requirement_set_status;
BEGIN
  IF workspace_deletion_is_authorized(OLD.workspace_id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  SELECT status INTO set_status
  FROM job_requirement_sets
  WHERE id = OLD.requirement_set_id AND workspace_id = OLD.workspace_id;
  IF set_status = 'reviewed' AND (TG_OP = 'UPDATE' OR pg_trigger_depth() = 1) THEN
    RAISE EXCEPTION 'requirements in a reviewed set are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_matching_history()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF workspace_deletion_is_authorized(OLD.workspace_id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'UPDATE' OR pg_trigger_depth() = 1 THEN
    RAISE EXCEPTION 'matching history is append-only' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_tailoring_task_result()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF workspace_deletion_is_authorized(OLD.workspace_id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'UPDATE' OR pg_trigger_depth() = 1 THEN
    RAISE EXCEPTION 'tailoring task results are append-only' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
