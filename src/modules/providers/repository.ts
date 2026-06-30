import type { Pool, PoolClient } from "pg";

import type {
  ModelProviderCapabilities,
  ModelTaskAssignments,
} from "../../../db/schema/providers";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";

import type { CredentialEnvelope } from "./credential-envelope";
import type { ProviderKind } from "./domain";

export class ProviderConfigurationNotFoundError extends Error {
  public constructor() {
    super("The model provider configuration is unavailable.");
    this.name = "ProviderConfigurationNotFoundError";
  }
}

export class ProviderConfigurationConflictError extends Error {
  public constructor() {
    super("The model provider configuration changed. Reload and try again.");
    this.name = "ProviderConfigurationConflictError";
  }
}

export interface ProviderConfigurationSummary {
  id: string;
  kind: ProviderKind;
  label: string;
  base_url: string;
  auth_type: "none" | "encrypted" | "environment";
  credential_last_four: string | null;
  environment_variable_name: string | null;
  capabilities: ModelProviderCapabilities;
  task_assignments: ModelTaskAssignments;
  status: "unverified" | "available" | "unavailable" | "disabled";
  last_tested_at: Date | null;
  revision: number;
}

export interface PrivateProviderConfiguration extends ProviderConfigurationSummary {
  workspace_id: string;
  credential_ciphertext: string | null;
  credential_nonce: string | null;
  credential_tag: string | null;
  credential_key_version: number | null;
}

async function audit(
  client: PoolClient,
  principal: WorkspacePrincipal,
  action: string,
  id: string,
  metadata: Record<string, unknown>,
) {
  await client.query(
    `INSERT INTO audit_events (workspace_id,actor_user_id,action,target_type,target_id,outcome,correlation_id,metadata) VALUES ($1,$2,$3,'model_provider_configuration',$4,'succeeded',$5,$6::jsonb)`,
    [
      principal.workspaceId,
      principal.userId,
      action,
      id,
      crypto.randomUUID(),
      JSON.stringify(metadata),
    ],
  );
}

export class ProviderConfigurationRepository {
  public constructor(private readonly pool: Pool) {}

  public async list(
    principal: WorkspacePrincipal,
  ): Promise<ProviderConfigurationSummary[]> {
    const result = await this.pool.query<ProviderConfigurationSummary>(
      `SELECT id,kind,label,base_url,auth_type,credential_last_four,environment_variable_name,capabilities,task_assignments,status,last_tested_at,revision
       FROM model_provider_configurations WHERE workspace_id=$1 ORDER BY label,id`,
      [principal.workspaceId],
    );
    return result.rows;
  }

  public async getPrivate(
    principal: WorkspacePrincipal,
    id: string,
  ): Promise<PrivateProviderConfiguration> {
    const result = await this.pool.query<PrivateProviderConfiguration>(
      `SELECT id,workspace_id,kind,label,base_url,auth_type,credential_ciphertext,credential_nonce,credential_tag,credential_key_version,credential_last_four,environment_variable_name,capabilities,task_assignments,status,last_tested_at,revision
       FROM model_provider_configurations WHERE id=$1 AND workspace_id=$2`,
      [id, principal.workspaceId],
    );
    if (!result.rows[0]) throw new ProviderConfigurationNotFoundError();
    return result.rows[0];
  }

  public async create(
    principal: WorkspacePrincipal,
    input: {
      id: string;
      kind: ProviderKind;
      label: string;
      baseUrl: string;
      authType: "none" | "encrypted" | "environment";
      envelope?: CredentialEnvelope;
      environmentVariableName?: string;
    },
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO model_provider_configurations
          (id,workspace_id,created_by_user_id,kind,label,base_url,auth_type,credential_ciphertext,credential_nonce,credential_tag,credential_key_version,credential_last_four,environment_variable_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          input.id,
          principal.workspaceId,
          principal.userId,
          input.kind,
          input.label,
          input.baseUrl,
          input.authType,
          input.envelope?.ciphertext ?? null,
          input.envelope?.nonce ?? null,
          input.envelope?.tag ?? null,
          input.envelope?.keyVersion ?? null,
          input.envelope?.lastFour ?? null,
          input.environmentVariableName ?? null,
        ],
      );
      await audit(client, principal, "provider.create", input.id, {
        kind: input.kind,
        authType: input.authType,
      });
      await client.query("COMMIT");
      return input.id;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async rotateEncryptedCredential(
    principal: WorkspacePrincipal,
    id: string,
    expectedRevision: number,
    envelope: CredentialEnvelope,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE model_provider_configurations SET auth_type='encrypted',credential_ciphertext=$4,credential_nonce=$5,credential_tag=$6,credential_key_version=$7,credential_last_four=$8,environment_variable_name=NULL,status='unverified',last_tested_at=NULL,revision=revision+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$2 AND revision=$3`,
        [
          id,
          principal.workspaceId,
          expectedRevision,
          envelope.ciphertext,
          envelope.nonce,
          envelope.tag,
          envelope.keyVersion,
          envelope.lastFour,
        ],
      );
      if (!result.rowCount) throw new ProviderConfigurationConflictError();
      await audit(client, principal, "provider.credential.rotate", id, {
        keyVersion: envelope.keyVersion,
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async assignTask(
    principal: WorkspacePrincipal,
    id: string,
    taskId: string,
    model: string,
    expectedRevision: number,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE model_provider_configurations SET task_assignments=jsonb_set(task_assignments,ARRAY[$4],to_jsonb($5::text),true),revision=revision+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$2 AND revision=$3`,
        [id, principal.workspaceId, expectedRevision, taskId, model],
      );
      if (!result.rowCount) throw new ProviderConfigurationConflictError();
      await audit(client, principal, "provider.task.assign", id, { taskId });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async recordCapabilityResult(
    principal: WorkspacePrincipal,
    id: string,
    capabilities: ModelProviderCapabilities,
    available: boolean,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE model_provider_configurations SET capabilities=$3::jsonb,status=$4::model_provider_status,last_tested_at=now(),revision=revision+1,updated_at=now() WHERE id=$1 AND workspace_id=$2`,
      [
        id,
        principal.workspaceId,
        JSON.stringify(capabilities),
        available ? "available" : "unavailable",
      ],
    );
    if (!result.rowCount) throw new ProviderConfigurationNotFoundError();
  }
}
