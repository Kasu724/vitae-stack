CREATE TYPE "public"."model_provider_auth_type" AS ENUM('none', 'encrypted', 'environment');--> statement-breakpoint
CREATE TYPE "public"."model_provider_kind" AS ENUM('openai_compatible', 'ollama');--> statement-breakpoint
CREATE TYPE "public"."model_provider_status" AS ENUM('unverified', 'available', 'unavailable', 'disabled');--> statement-breakpoint
CREATE TABLE "model_provider_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"kind" "model_provider_kind" NOT NULL,
	"label" text NOT NULL,
	"base_url" text NOT NULL,
	"auth_type" "model_provider_auth_type" DEFAULT 'none' NOT NULL,
	"credential_ciphertext" text,
	"credential_nonce" text,
	"credential_tag" text,
	"credential_key_version" integer,
	"credential_last_four" text,
	"environment_variable_name" text,
	"capabilities" jsonb DEFAULT '{"schemaVersion":1,"structuredOutput":false,"usage":false,"refusal":false,"warnings":[]}'::jsonb NOT NULL,
	"task_assignments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "model_provider_status" DEFAULT 'unverified' NOT NULL,
	"last_tested_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_provider_configurations_credential_pair" CHECK (("model_provider_configurations"."auth_type" = 'encrypted' AND "model_provider_configurations"."credential_ciphertext" IS NOT NULL AND "model_provider_configurations"."credential_nonce" IS NOT NULL AND "model_provider_configurations"."credential_tag" IS NOT NULL AND "model_provider_configurations"."credential_key_version" IS NOT NULL AND "model_provider_configurations"."credential_last_four" IS NOT NULL AND "model_provider_configurations"."environment_variable_name" IS NULL)
          OR ("model_provider_configurations"."auth_type" = 'environment' AND "model_provider_configurations"."credential_ciphertext" IS NULL AND "model_provider_configurations"."credential_nonce" IS NULL AND "model_provider_configurations"."credential_tag" IS NULL AND "model_provider_configurations"."credential_key_version" IS NULL AND "model_provider_configurations"."credential_last_four" IS NULL AND "model_provider_configurations"."environment_variable_name" IS NOT NULL)
          OR ("model_provider_configurations"."auth_type" = 'none' AND "model_provider_configurations"."credential_ciphertext" IS NULL AND "model_provider_configurations"."credential_nonce" IS NULL AND "model_provider_configurations"."credential_tag" IS NULL AND "model_provider_configurations"."credential_key_version" IS NULL AND "model_provider_configurations"."credential_last_four" IS NULL AND "model_provider_configurations"."environment_variable_name" IS NULL)),
	CONSTRAINT "model_provider_configurations_capabilities_object" CHECK (jsonb_typeof("model_provider_configurations"."capabilities") = 'object'),
	CONSTRAINT "model_provider_configurations_assignments_object" CHECK (jsonb_typeof("model_provider_configurations"."task_assignments") = 'object'),
	CONSTRAINT "model_provider_configurations_revision_positive" CHECK ("model_provider_configurations"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "model_provider_configurations" ADD CONSTRAINT "model_provider_configurations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_provider_configurations" ADD CONSTRAINT "model_provider_configurations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_provider_configurations_id_workspace_unique" ON "model_provider_configurations" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "model_provider_configurations_workspace_label_unique" ON "model_provider_configurations" USING btree ("workspace_id","label");--> statement-breakpoint
CREATE INDEX "model_provider_configurations_workspace_status_idx" ON "model_provider_configurations" USING btree ("workspace_id","status");
--> statement-breakpoint
CREATE FUNCTION protect_model_provider_configuration_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW.id <> OLD.id OR NEW.workspace_id <> OLD.workspace_id OR NEW.kind <> OLD.kind THEN
		RAISE EXCEPTION 'model provider credential context is immutable';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER model_provider_configuration_context_immutable BEFORE UPDATE ON model_provider_configurations FOR EACH ROW EXECUTE FUNCTION protect_model_provider_configuration_context();
