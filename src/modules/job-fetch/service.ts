import { z } from "zod";

import { FilesystemArtifactStore } from "@/infrastructure/artifacts/filesystem-store";
import type { ServerEnvironment } from "@/infrastructure/config/environment-schema";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";
import { jobMetadataInputSchema } from "@/modules/jobs/domain";
import { JobRepository } from "@/modules/jobs/repository";

import { fetchPublicJobDescription } from "./fetcher";
import { UnsafeJobUrlError, validatePublicJobUrl } from "./network-policy";
import {
  jobFetchMessageKey,
  jobFetchRequestSchema,
  jobFetchResultSchema,
} from "./protocol";
import { JobUrlImportRepository, type JobUrlImportRecord } from "./repository";

export class JobUrlImportDisabledError extends Error {
  public constructor() {
    super("Job URL import is disabled by the operator.");
    this.name = "JobUrlImportDisabledError";
  }
}

export class JobUrlImportService {
  private readonly queue: FilesystemArtifactStore;

  public constructor(
    private readonly imports: JobUrlImportRepository,
    private readonly jobs: JobRepository,
    private readonly environment: ServerEnvironment,
  ) {
    this.queue = new FilesystemArtifactStore(environment.JOB_FETCH_QUEUE_ROOT);
  }

  public async start(
    principal: WorkspacePrincipal,
    raw: {
      title: string;
      company: string;
      url: string;
      idempotencyKey: string;
    },
  ): Promise<string> {
    if (this.environment.JOB_FETCH_MODE === "disabled")
      throw new JobUrlImportDisabledError();
    const metadata = jobMetadataInputSchema.parse(raw);
    const url = validatePublicJobUrl(raw.url);
    const idempotencyKey = z.string().uuid().parse(raw.idempotencyKey);
    const record = await this.imports.create(principal, {
      title: metadata.title,
      company: metadata.company,
      requestedUrl: url.href,
      idempotencyKey,
    });
    if (record.status !== "pending") return record.id;
    const key = jobFetchMessageKey(principal.workspaceId, record.operation_id);
    const existingMessage = await this.queue.readJson(key).catch(() => null);
    const existingRequest = jobFetchRequestSchema.safeParse(existingMessage);
    const existingResult = jobFetchResultSchema.safeParse(existingMessage);
    const requestReusable =
      existingRequest.success &&
      existingRequest.data.operationId === record.operation_id &&
      existingRequest.data.url === url.href;
    const resultReusable =
      existingResult.success &&
      existingResult.data.operationId === record.operation_id;
    if (!requestReusable && !resultReusable) {
      try {
        await this.queue.putJsonAtomic(key, {
          schemaVersion: 1,
          state: "request",
          operationId: record.operation_id,
          url: url.href,
        });
      } catch (error) {
        await this.imports.fail(principal, record.id, "QUEUE_WRITE_FAILED");
        throw error;
      }
    }
    if (this.environment.JOB_FETCH_MODE === "inline") {
      if (resultReusable) return record.id;
      try {
        const result = await fetchPublicJobDescription(url.href);
        await this.queue.putJsonAtomic(key, {
          schemaVersion: 1,
          state: "result",
          operationId: record.operation_id,
          ok: true,
          result,
        });
      } catch (error) {
        await this.queue.putJsonAtomic(key, {
          schemaVersion: 1,
          state: "result",
          operationId: record.operation_id,
          ok: false,
          errorCode:
            error instanceof UnsafeJobUrlError ? error.code : "FETCH_FAILED",
        });
      }
    }
    return record.id;
  }

  public async refresh(
    principal: WorkspacePrincipal,
    importId: string,
  ): Promise<JobUrlImportRecord> {
    let record = await this.imports.get(principal, importId);
    if (record.status !== "pending") return record;
    const key = jobFetchMessageKey(principal.workspaceId, record.operation_id);
    const message = await this.queue.readJson(key).catch(() => null);
    const parsed = jobFetchResultSchema.safeParse(message);
    if (!parsed.success) {
      if (
        message &&
        typeof message === "object" &&
        "state" in message &&
        message.state === "result"
      ) {
        await this.imports.fail(principal, importId, "PIPELINE_RESULT_INVALID");
        await this.queue.delete(key);
        return this.imports.get(principal, importId);
      }
      return record;
    }
    if (parsed.data.operationId !== record.operation_id) {
      await this.imports.fail(principal, importId, "RESULT_OPERATION_MISMATCH");
      await this.queue.delete(key);
      return this.imports.get(principal, importId);
    }
    if (!parsed.data.ok) {
      await this.imports.fail(principal, importId, parsed.data.errorCode);
      await this.queue.delete(key);
      return this.imports.get(principal, importId);
    }
    const finalUrl = validatePublicJobUrl(parsed.data.result.finalUrl);
    if (
      parsed.data.result.requestedUrl !== record.requested_url ||
      finalUrl.origin !== parsed.data.result.finalOrigin
    ) {
      await this.imports.fail(principal, importId, "RESULT_PROVENANCE_INVALID");
      await this.queue.delete(key);
      return this.imports.get(principal, importId);
    }
    const jobId = await this.jobs.createFromUrl(
      principal,
      { title: record.title, company: record.company ?? "" },
      parsed.data.result,
      record.operation_id,
    );
    await this.imports.succeed(principal, importId, jobId);
    await this.queue.delete(key);
    record = await this.imports.get(principal, importId);
    return record;
  }
}
