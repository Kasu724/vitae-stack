import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import type { ServerEnvironment } from "@/infrastructure/config/environment";

import type { AIProvider, ProviderRequest } from "./contracts";
import {
  decryptCredential,
  encryptCredential,
  type CredentialEnvelope,
} from "./credential-envelope";
import { providerConfigurationInputSchema } from "./domain";
import {
  parseProviderPrivateOriginAllowlist,
  validateProviderBaseUrl,
} from "./endpoint-policy";
import { NodeProviderHttpTransport } from "./node-http-transport";
import { OllamaAdapter } from "./ollama-adapter";
import { OpenAiCompatibleAdapter } from "./openai-compatible-adapter";
import { providerRequestGuard } from "./request-guard";
import {
  ProviderConfigurationRepository,
  type PrivateProviderConfiguration,
} from "./repository";
import {
  StructuredTaskRunner,
  type StructuredTaskInput,
  type StructuredTaskResult,
} from "./structured-task-runner";

export class ProviderCapabilityError extends Error {
  public constructor() {
    super("The selected provider is not ready for this AI task.");
    this.name = "ProviderCapabilityError";
  }
}

const capabilityRequest: Omit<ProviderRequest, "model"> = {
  taskId: "AI-10",
  taskVersion: "ai-10.v1",
  system:
    "Return the exact synthetic JSON object requested. No user or career data is present.",
  user: 'Return {"ok":"vitae-capability-test"}.',
  schemaName: "vitae_capability_test",
  jsonSchema: {
    type: "object",
    properties: { ok: { type: "string", enum: ["vitae-capability-test"] } },
    required: ["ok"],
    additionalProperties: false,
  },
  temperature: 0,
  maxOutputTokens: 64,
  timeoutMs: 15_000,
  correlationId: "provider-capability-test",
};

export class ProviderConfigurationService {
  public constructor(
    private readonly repository: ProviderConfigurationRepository,
    private readonly environment: ServerEnvironment,
  ) {}

  private endpoint(baseUrl: string) {
    return validateProviderBaseUrl(
      baseUrl,
      parseProviderPrivateOriginAllowlist(
        this.environment.AI_PRIVATE_ENDPOINT_ALLOWLIST,
      ),
    );
  }

  public async create(
    principal: WorkspacePrincipal,
    raw: unknown,
  ): Promise<string> {
    const input = providerConfigurationInputSchema.parse(raw);
    const id = crypto.randomUUID();
    const endpoint = this.endpoint(input.baseUrl);
    let envelope: CredentialEnvelope | undefined;
    if (input.authType === "encrypted") {
      envelope = encryptCredential(
        input.credential!,
        this.environment.CREDENTIAL_ENCRYPTION_KEY,
        this.environment.CREDENTIAL_KEY_VERSION,
        {
          workspaceId: principal.workspaceId,
          configurationId: id,
          providerKind: input.kind,
        },
      );
    }
    return this.repository.create(principal, {
      id,
      kind: input.kind,
      label: input.label,
      baseUrl: endpoint.baseUrl.href,
      authType: input.authType,
      ...(envelope ? { envelope } : {}),
      ...(input.environmentVariableName
        ? { environmentVariableName: input.environmentVariableName }
        : {}),
    });
  }

  public async rotateCredential(
    principal: WorkspacePrincipal,
    id: string,
    credential: string,
    expectedRevision: number,
  ): Promise<void> {
    const config = await this.repository.getPrivate(principal, id);
    const envelope = encryptCredential(
      credential,
      this.environment.CREDENTIAL_ENCRYPTION_KEY,
      this.environment.CREDENTIAL_KEY_VERSION,
      {
        workspaceId: principal.workspaceId,
        configurationId: id,
        providerKind: config.kind,
      },
    );
    if (
      decryptCredential(envelope, this.environment.CREDENTIAL_ENCRYPTION_KEY, {
        workspaceId: principal.workspaceId,
        configurationId: id,
        providerKind: config.kind,
      }) !== credential
    )
      throw new Error("Credential envelope verification failed.");
    await this.repository.rotateEncryptedCredential(
      principal,
      id,
      expectedRevision,
      envelope,
    );
  }

  private credential(config: PrivateProviderConfiguration): string | null {
    if (config.auth_type === "none") return null;
    if (config.auth_type === "environment") {
      const name = config.environment_variable_name!;
      if (!/^AI_PROVIDER_[A-Z0-9_]{1,100}$/u.test(name)) return null;
      return process.env[name] ?? null;
    }
    return decryptCredential(
      {
        ciphertext: config.credential_ciphertext!,
        nonce: config.credential_nonce!,
        tag: config.credential_tag!,
        keyVersion: config.credential_key_version!,
        lastFour: config.credential_last_four!,
      },
      this.environment.CREDENTIAL_ENCRYPTION_KEY,
      {
        workspaceId: config.workspace_id,
        configurationId: config.id,
        providerKind: config.kind,
      },
    );
  }

  private adapter(config: PrivateProviderConfiguration): AIProvider {
    const endpoint = this.endpoint(config.base_url);
    const transport = new NodeProviderHttpTransport(endpoint);
    const credential = this.credential(config);
    return config.kind === "ollama"
      ? new OllamaAdapter(endpoint.baseUrl, credential, transport)
      : new OpenAiCompatibleAdapter(endpoint.baseUrl, credential, transport);
  }

  public async testCapability(
    principal: WorkspacePrincipal,
    id: string,
    model: string,
  ): Promise<boolean> {
    await this.repository.consumeRateLimit(principal, "provider-test", 10);
    const config = await this.repository.getPrivate(principal, id);
    let available = false;
    let usage = false;
    const refusal = config.kind === "openai_compatible";
    const warnings: string[] = [];
    try {
      const result = await this.adapter(config).generate({
        ...capabilityRequest,
        model,
      });
      if (result.status === "completed") {
        const value = JSON.parse(result.text) as { ok?: unknown };
        available = value.ok === "vitae-capability-test";
        usage = result.usage !== undefined;
        warnings.push(...result.warnings);
      }
    } catch {
      available = false;
    }
    await this.repository.recordCapabilityResult(
      principal,
      id,
      {
        schemaVersion: 1,
        structuredOutput: available,
        usage,
        refusal,
        testedAt: new Date().toISOString(),
        warnings,
      },
      available,
    );
    return available;
  }

  public async runTask<T>(
    principal: WorkspacePrincipal,
    configurationId: string,
    input: Omit<StructuredTaskInput<T>, "model">,
  ): Promise<
    StructuredTaskResult<T> & { providerKind: "openai_compatible" | "ollama" }
  > {
    await this.repository.consumeRateLimit(principal, "provider-task", 60);
    const config = await this.repository.getPrivate(principal, configurationId);
    const model = config.task_assignments[input.taskId];
    if (
      config.status !== "available" ||
      !config.capabilities.structuredOutput ||
      !model
    )
      throw new ProviderCapabilityError();
    const result = await providerRequestGuard.run(configurationId, () =>
      new StructuredTaskRunner(this.adapter(config)).run({
        ...input,
        model,
      }),
    );
    return { ...result, providerKind: config.kind };
  }
}
