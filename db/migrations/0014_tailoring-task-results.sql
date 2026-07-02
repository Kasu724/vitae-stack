CREATE TABLE "tailoring_task_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"task_id" text NOT NULL,
	"task_version" text NOT NULL,
	"provider_kind" text NOT NULL,
	"model" text NOT NULL,
	"attempts" integer NOT NULL,
	"input_hash" text NOT NULL,
	"output_hash" text NOT NULL,
	"usage" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tailoring_task_results_attempts_positive" CHECK ("tailoring_task_results"."attempts" > 0),
	CONSTRAINT "tailoring_task_results_hashes" CHECK ("tailoring_task_results"."input_hash" ~ '^sha256:[0-9a-f]{64}$' AND "tailoring_task_results"."output_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "tailoring_task_results_objects" CHECK (jsonb_typeof("tailoring_task_results"."usage") = 'object' AND jsonb_typeof("tailoring_task_results"."result") = 'object')
);
--> statement-breakpoint
ALTER TABLE "tailoring_task_results" ADD CONSTRAINT "tailoring_task_results_run_workspace_fk" FOREIGN KEY ("run_id","workspace_id") REFERENCES "public"."tailoring_runs"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tailoring_task_results_id_workspace_unique" ON "tailoring_task_results" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tailoring_task_results_run_sequence_unique" ON "tailoring_task_results" USING btree ("run_id","sequence");
--> statement-breakpoint
CREATE FUNCTION protect_tailoring_task_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'UPDATE' OR pg_trigger_depth() = 1 THEN
		RAISE EXCEPTION 'tailoring task results are append-only' USING ERRCODE = '23514';
	END IF;
	RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER tailoring_task_results_append_only BEFORE UPDATE OR DELETE ON tailoring_task_results FOR EACH ROW EXECUTE FUNCTION protect_tailoring_task_result();
