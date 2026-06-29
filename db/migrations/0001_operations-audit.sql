CREATE TYPE "public"."audit_outcome" AS ENUM('succeeded', 'denied', 'failed');--> statement-breakpoint
CREATE TYPE "public"."job_operation_state" AS ENUM('pending', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"outcome" "audit_outcome" NOT NULL,
	"correlation_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_metadata_object" CHECK (jsonb_typeof("audit_events"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "job_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"operation_type" text NOT NULL,
	"state" "job_operation_state" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"input_hash" text NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_operations_attempt_bounds" CHECK ("job_operations"."attempt" >= 0 AND "job_operations"."max_attempts" > 0 AND "job_operations"."attempt" <= "job_operations"."max_attempts"),
	CONSTRAINT "job_operations_lease_pair" CHECK (("job_operations"."lease_owner" IS NULL) = ("job_operations"."lease_expires_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_operations" ADD CONSTRAINT "job_operations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_workspace_created_idx" ON "audit_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_correlation_idx" ON "audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_operations_workspace_idempotency_unique" ON "job_operations" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "job_operations_id_workspace_unique" ON "job_operations" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE INDEX "job_operations_queue_idx" ON "job_operations" USING btree ("state","available_at","created_at");--> statement-breakpoint
DO $grant_runtime$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vitae_app') THEN
		EXECUTE 'GRANT USAGE ON SCHEMA public TO vitae_app';
		EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vitae_app';
		EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vitae_app';
		EXECUTE 'GRANT USAGE ON SCHEMA drizzle TO vitae_app';
		EXECUTE 'GRANT SELECT ON TABLE drizzle.__drizzle_migrations TO vitae_app';
	END IF;
END
$grant_runtime$;
