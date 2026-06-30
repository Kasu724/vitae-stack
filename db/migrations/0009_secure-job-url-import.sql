CREATE TYPE "public"."job_url_import_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "job_url_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"title" text NOT NULL,
	"company" text,
	"requested_url" text NOT NULL,
	"status" "job_url_import_status" DEFAULT 'pending' NOT NULL,
	"job_posting_id" uuid,
	"error_code" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_url_imports_terminal_state" CHECK (("job_url_imports"."status" = 'pending' AND "job_url_imports"."completed_at" IS NULL AND "job_url_imports"."job_posting_id" IS NULL AND "job_url_imports"."error_code" IS NULL)
          OR ("job_url_imports"."status" = 'succeeded' AND "job_url_imports"."completed_at" IS NOT NULL AND "job_url_imports"."job_posting_id" IS NOT NULL AND "job_url_imports"."error_code" IS NULL)
          OR ("job_url_imports"."status" = 'failed' AND "job_url_imports"."completed_at" IS NOT NULL AND "job_url_imports"."job_posting_id" IS NULL AND "job_url_imports"."error_code" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "job_url_imports" ADD CONSTRAINT "job_url_imports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_url_imports" ADD CONSTRAINT "job_url_imports_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_url_imports" ADD CONSTRAINT "job_url_imports_operation_workspace_fk" FOREIGN KEY ("operation_id","workspace_id") REFERENCES "public"."job_operations"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_url_imports" ADD CONSTRAINT "job_url_imports_posting_workspace_fk" FOREIGN KEY ("job_posting_id","workspace_id") REFERENCES "public"."job_postings"("id","workspace_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_url_imports_id_workspace_unique" ON "job_url_imports" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_url_imports_operation_unique" ON "job_url_imports" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "job_url_imports_workspace_status_created_idx" ON "job_url_imports" USING btree ("workspace_id","status","created_at");
--> statement-breakpoint
CREATE FUNCTION protect_job_url_import_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF OLD.status <> 'pending' THEN
		RAISE EXCEPTION 'resolved URL imports are immutable' USING ERRCODE = 'check_violation';
	END IF;
	IF NEW.id IS DISTINCT FROM OLD.id
		OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
		OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
		OR NEW.requested_by_user_id IS DISTINCT FROM OLD.requested_by_user_id
		OR NEW.title IS DISTINCT FROM OLD.title
		OR NEW.company IS DISTINCT FROM OLD.company
		OR NEW.requested_url IS DISTINCT FROM OLD.requested_url
		OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
		RAISE EXCEPTION 'URL import request fields are immutable' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER job_url_imports_protected_update
BEFORE UPDATE ON job_url_imports
FOR EACH ROW EXECUTE FUNCTION protect_job_url_import_update();
