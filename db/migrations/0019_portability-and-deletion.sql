CREATE TYPE "public"."workspace_deletion_state" AS ENUM('pending', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "workspace_deletion_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requester_user_hash" text NOT NULL,
	"state" "workspace_deletion_state" DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"backup_expires_at" timestamp with time zone NOT NULL,
	"deleted_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_deletion_operations_attempt_nonnegative" CHECK ("workspace_deletion_operations"."attempt" >= 0),
	CONSTRAINT "workspace_deletion_operations_counts_object" CHECK (jsonb_typeof("workspace_deletion_operations"."deleted_counts") = 'object'),
	CONSTRAINT "workspace_deletion_operations_backup_window" CHECK ("workspace_deletion_operations"."backup_expires_at" <= "workspace_deletion_operations"."requested_at" + interval '30 days')
);--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "deletion_requested_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_deletion_operations_workspace_unique" ON "workspace_deletion_operations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_deletion_operations_queue_idx" ON "workspace_deletion_operations" USING btree ("state","requested_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_frozen_workspace_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scoped_workspace uuid;
BEGIN
  IF current_setting('vitae.workspace_deletion', true) = 'on' THEN
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
$$;--> statement-breakpoint
DO $freeze_triggers$
DECLARE target record;
BEGIN
  FOR target IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'workspace_id'
      AND table_name <> 'workspace_deletion_operations'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION reject_frozen_workspace_write()',
      'freeze_' || target.table_name || '_write',
      target.table_name
    );
  END LOOP;
END
$freeze_triggers$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_frozen_workspace_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.deletion_requested_at IS NOT NULL THEN
    RAISE EXCEPTION 'workspace is frozen for deletion' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER freeze_workspaces_write
BEFORE UPDATE ON workspaces
FOR EACH ROW EXECUTE FUNCTION reject_frozen_workspace_update();--> statement-breakpoint
DO $grant_runtime$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vitae_app') THEN
		EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_deletion_operations TO vitae_app';
	END IF;
END
$grant_runtime$;
