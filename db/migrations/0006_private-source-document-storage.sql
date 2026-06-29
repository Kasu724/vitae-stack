CREATE TYPE "public"."source_document_purpose" AS ENUM('resume', 'cover_letter', 'job_description', 'career_evidence', 'project_import');--> statement-breakpoint
CREATE TYPE "public"."source_document_status" AS ENUM('quarantined', 'processing', 'ready', 'rejected', 'deleted');--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid,
	"purpose" "source_document_purpose" NOT NULL,
	"original_name" text NOT NULL,
	"declared_media_type" text NOT NULL,
	"detected_media_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"content_hash" text NOT NULL,
	"storage_key" text NOT NULL,
	"status" "source_document_status" DEFAULT 'quarantined' NOT NULL,
	"extracted_text" text,
	"parse_metadata" jsonb DEFAULT '{"schemaVersion":1}'::jsonb NOT NULL,
	"warnings" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"parser_version" text,
	"error_code" text,
	"processed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_documents_size_positive" CHECK ("source_documents"."byte_size" > 0),
	CONSTRAINT "source_documents_hash_format" CHECK ("source_documents"."content_hash" ~ '^sha256:[0-9a-f]{64}$'),
	CONSTRAINT "source_documents_metadata_object" CHECK (jsonb_typeof("source_documents"."parse_metadata") = 'object')
);
--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "source_documents_id_workspace_unique" ON "source_documents" USING btree ("id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_documents_storage_key_unique" ON "source_documents" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "source_documents_workspace_status_idx" ON "source_documents" USING btree ("workspace_id","status","created_at");