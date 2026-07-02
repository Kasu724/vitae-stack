CREATE TYPE "public"."export_classification" AS ENUM('final', 'draft');--> statement-breakpoint
CREATE TYPE "public"."export_format" AS ENUM('pdf', 'docx', 'markdown', 'text', 'json');--> statement-breakpoint
CREATE TABLE "export_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"format" "export_format" NOT NULL,
	"classification" "export_classification" NOT NULL,
	"media_type" text NOT NULL,
	"filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"content_hash" text NOT NULL,
	"input_hash" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "export_artifacts_hashes" CHECK ("export_artifacts"."content_hash" ~ '^sha256:[0-9a-f]{64}$' AND "export_artifacts"."input_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "export_artifacts_size_bounds" CHECK ("export_artifacts"."byte_size" > 0 AND "export_artifacts"."byte_size" <= 10485760),
	CONSTRAINT "export_artifacts_filename_safe" CHECK (length("export_artifacts"."filename") BETWEEN 1 AND 180 AND position('/' in "export_artifacts"."filename")=0 AND position(chr(92) in "export_artifacts"."filename")=0 AND position(chr(10) in "export_artifacts"."filename")=0 AND position(chr(13) in "export_artifacts"."filename")=0),
	CONSTRAINT "export_artifacts_manifest_object" CHECK (jsonb_typeof("export_artifacts"."manifest")='object'),
	CONSTRAINT "export_artifacts_draft_format" CHECK ("export_artifacts"."classification"='final' OR "export_artifacts"."format" IN ('markdown','text','json')),
	CONSTRAINT "export_artifacts_expiry_after_creation" CHECK ("export_artifacts"."expires_at" > "export_artifacts"."created_at")
);
--> statement-breakpoint
ALTER TABLE "export_artifacts" ADD CONSTRAINT "export_artifacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_artifacts" ADD CONSTRAINT "export_artifacts_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_artifacts" ADD CONSTRAINT "export_artifacts_version_workspace_fk" FOREIGN KEY ("document_version_id","workspace_id") REFERENCES "public"."document_versions"("id","workspace_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "export_artifacts_id_workspace_unique" ON "export_artifacts" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "export_artifacts_workspace_input_unique" ON "export_artifacts" USING btree ("workspace_id","input_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "export_artifacts_storage_key_unique" ON "export_artifacts" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "export_artifacts_workspace_expiry_idx" ON "export_artifacts" USING btree ("workspace_id","expires_at");
--> statement-breakpoint
CREATE TRIGGER export_artifacts_immutable
BEFORE UPDATE ON export_artifacts
FOR EACH ROW EXECUTE FUNCTION reject_immutable_document_update();
