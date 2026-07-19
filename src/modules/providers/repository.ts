import {
  type Pool,
  type PoolClient,
  withTransaction,
} from "@/infrastructure/database/sqlite-pool";

import type {
  ModelProviderCapabilities,
  ModelTaskAssignments,
} from "@/infrastructure/database/value-types";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import { consumeApplicationRateLimit } from "@/infrastructure/security/rate-limit";

import type { AiTaskId } from "./contracts";
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

export class ProviderConfigurationInUseError extends Error {
  public constructor() {
    super(
      "The model provider is used by saved AI history and cannot be deleted.",
    );
    this.name = "ProviderConfigurationInUseError";
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
  tailoring_run_count: number;
  ats_report_count: number;
}

export interface PrivateProviderConfiguration extends Omit<
  ProviderConfigurationSummary,
  "tailoring_run_count" | "ats_report_count"
> {
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

  public async consumeRateLimit(
    principal: WorkspacePrincipal,
    scope: "provider-test" | "provider-task",
    limit: number,
  ): Promise<void> {
    await consumeApplicationRateLimit(this.pool, {
      scope,
      subject: principal.userId,
      limit,
      windowMs: 60 * 60 * 1_000,
    });
  }

  public async list(
    principal: WorkspacePrincipal,
  ): Promise<ProviderConfigurationSummary[]> {
    const result = await this.pool.query<ProviderConfigurationSummary>(
      `SELECT p.id,p.kind,p.label,p.base_url,p.auth_type,p.credential_last_four,
              p.environment_variable_name,p.capabilities,p.task_assignments,p.status,
              p.last_tested_at,p.revision,
              (SELECT COUNT(*) FROM tailoring_runs r
               WHERE r.provider_configuration_id=p.id AND r.workspace_id=p.workspace_id) AS tailoring_run_count,
              ((SELECT COUNT(*) FROM ats_reports r
                WHERE r.provider_configuration_id=p.id AND r.workspace_id=p.workspace_id) +
               (SELECT COUNT(*) FROM source_ats_reports r
                WHERE r.provider_configuration_id=p.id AND r.workspace_id=p.workspace_id)) AS ats_report_count
       FROM model_provider_configurations p WHERE p.workspace_id=$1 ORDER BY p.label,p.id`,
      [principal.workspaceId],
    );
    return result.rows;
  }

  public async listReadyForTask(
    principal: WorkspacePrincipal,
    taskId: AiTaskId,
  ): Promise<ProviderConfigurationSummary[]> {
    return (await this.list(principal)).filter(
      (configuration) =>
        configuration.status === "available" &&
        configuration.capabilities.structuredOutput &&
        Boolean(configuration.task_assignments[taskId]),
    );
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
    return withTransaction(this.pool, async (client) => {
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
      return input.id;
    });
  }

  public async rotateEncryptedCredential(
    principal: WorkspacePrincipal,
    id: string,
    expectedRevision: number,
    envelope: CredentialEnvelope,
  ): Promise<void> {
    return withTransaction(this.pool, async (client) => {
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
    });
  }

  public async assignTask(
    principal: WorkspacePrincipal,
    id: string,
    taskId: string,
    model: string,
    expectedRevision: number,
  ): Promise<void> {
    await this.assignTasks(principal, id, [taskId], model, expectedRevision);
  }

  public async assignTasks(
    principal: WorkspacePrincipal,
    id: string,
    taskIds: readonly string[],
    model: string,
    expectedRevision: number,
  ): Promise<void> {
    if (!taskIds.length) throw new ProviderConfigurationConflictError();
    return withTransaction(this.pool, async (client) => {
      const current = await client.query<{
        task_assignments: Record<string, string>;
      }>(
        `SELECT task_assignments
         FROM model_provider_configurations
         WHERE id=$1 AND workspace_id=$2 AND revision=$3`,
        [id, principal.workspaceId, expectedRevision],
      );
      const existing = current.rows[0];
      if (!existing) throw new ProviderConfigurationConflictError();
      const assignments = Object.fromEntries(
        taskIds.map((taskId) => [taskId, model]),
      );
      const result = await client.query(
        `UPDATE model_provider_configurations SET task_assignments=$4::jsonb,revision=revision+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$2 AND revision=$3`,
        [
          id,
          principal.workspaceId,
          expectedRevision,
          JSON.stringify({ ...existing.task_assignments, ...assignments }),
        ],
      );
      if (!result.rowCount) throw new ProviderConfigurationConflictError();
      await audit(client, principal, "provider.task.assign", id, { taskIds });
    });
  }

  public async unassignTask(
    principal: WorkspacePrincipal,
    id: string,
    taskId: string,
    expectedRevision: number,
  ): Promise<void> {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE model_provider_configurations SET task_assignments=task_assignments-$4,revision=revision+1,updated_at=now()
         WHERE id=$1 AND workspace_id=$2 AND revision=$3`,
        [id, principal.workspaceId, expectedRevision, taskId],
      );
      if (!result.rowCount) throw new ProviderConfigurationConflictError();
      await audit(client, principal, "provider.task.unassign", id, { taskId });
    });
  }

  public async delete(
    principal: WorkspacePrincipal,
    id: string,
    expectedRevision: number,
  ): Promise<void> {
    return withTransaction(this.pool, async (client) => {
      const configuration = await client.query<{
        revision: number;
        tailoring_run_count: number;
        ats_report_count: number;
      }>(
        `SELECT p.revision,
                (SELECT COUNT(*) FROM tailoring_runs r
                 WHERE r.provider_configuration_id=p.id AND r.workspace_id=p.workspace_id) AS tailoring_run_count,
                ((SELECT COUNT(*) FROM ats_reports r
                  WHERE r.provider_configuration_id=p.id AND r.workspace_id=p.workspace_id) +
                 (SELECT COUNT(*) FROM source_ats_reports r
                  WHERE r.provider_configuration_id=p.id AND r.workspace_id=p.workspace_id)) AS ats_report_count
         FROM model_provider_configurations p
         WHERE p.id=$1 AND p.workspace_id=$2`,
        [id, principal.workspaceId],
      );
      const current = configuration.rows[0];
      if (!current) throw new ProviderConfigurationNotFoundError();
      if (current.revision !== expectedRevision)
        throw new ProviderConfigurationConflictError();
      if (current.tailoring_run_count > 0 || current.ats_report_count > 0)
        throw new ProviderConfigurationInUseError();

      const result = await client.query(
        `DELETE FROM model_provider_configurations
         WHERE id=$1 AND workspace_id=$2 AND revision=$3`,
        [id, principal.workspaceId, expectedRevision],
      );
      if (!result.rowCount) throw new ProviderConfigurationConflictError();
      await audit(client, principal, "provider.delete", id, {
        deletedCredential: true,
      });
    });
  }

  public async recordCapabilityResult(
    principal: WorkspacePrincipal,
    id: string,
    expectedRevision: number,
    capabilities: ModelProviderCapabilities,
    available: boolean,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE model_provider_configurations
       SET capabilities=$4::jsonb,status=$5::model_provider_status,last_tested_at=now(),
           revision=revision+1,updated_at=now()
       WHERE id=$1 AND workspace_id=$2 AND revision=$3`,
      [
        id,
        principal.workspaceId,
        expectedRevision,
        JSON.stringify(capabilities),
        available ? "available" : "unavailable",
      ],
    );
    if (!result.rowCount) throw new ProviderConfigurationConflictError();
  }
}
