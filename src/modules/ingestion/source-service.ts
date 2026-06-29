import { createHash } from "node:crypto";
import { z } from "zod";

import {
  FilesystemArtifactStore,
  parserMessageKey,
  sourceStorageKey,
} from "@/infrastructure/artifacts/filesystem-store";
import type { ServerEnvironment } from "@/infrastructure/config/environment-schema";
import type { WorkspacePrincipal } from "@/modules/auth/workspace-access";

import {
  detectSupportedMediaType,
  safeDisplayFilename,
  UnsafeUploadError,
} from "./file-validation";
import { runParserChild } from "./parser-runner";
import {
  SourceRepository,
  type SourceDocumentRecord,
} from "./source-repository";

const sidecarResultSchema = z.discriminatedUnion("ok", [
  z.object({
    state: z.literal("result"),
    ok: z.literal(true),
    result: z.object({
      text: z.string(),
      metadata: z.object({
        schemaVersion: z.literal(1),
        pageCount: z.number().int().positive().optional(),
        paragraphCount: z.number().int().nonnegative().optional(),
      }),
      warnings: z.array(z.string()),
      parserVersion: z.string(),
    }),
  }),
  z.object({
    state: z.literal("result"),
    ok: z.literal(false),
    errorCode: z.string(),
  }),
]);

export class SourceService {
  private readonly store: FilesystemArtifactStore;

  public constructor(
    private readonly repository: SourceRepository,
    private readonly environment: ServerEnvironment,
  ) {
    this.store = new FilesystemArtifactStore(environment.ARTIFACT_STORAGE_ROOT);
  }

  public async upload(
    principal: WorkspacePrincipal,
    input: {
      purpose: SourceDocumentRecord["purpose"];
      filename: string;
      declaredMediaType: string;
      bytes: Buffer;
    },
  ): Promise<string> {
    if (
      input.bytes.length === 0 ||
      input.bytes.length > this.environment.UPLOAD_MAX_BYTES
    )
      throw new UnsafeUploadError(
        input.bytes.length === 0 ? "EMPTY_FILE" : "FILE_TOO_LARGE",
      );
    const originalName = safeDisplayFilename(input.filename);
    const mediaType = await detectSupportedMediaType({
      bytes: input.bytes,
      declaredMediaType: input.declaredMediaType,
      filename: originalName,
    });
    const id = crypto.randomUUID();
    const storageKey = sourceStorageKey(principal.workspaceId, id);
    await this.store.putExclusive(storageKey, input.bytes);
    try {
      await this.repository.insertQuarantined(principal, {
        id,
        purpose: input.purpose,
        original_name: originalName,
        declared_media_type: input.declaredMediaType,
        detected_media_type: mediaType,
        byte_size: input.bytes.length,
        content_hash: `sha256:${createHash("sha256").update(input.bytes).digest("hex")}`,
        storage_key: storageKey,
      });
      await this.repository.markProcessing(principal, id);
      if (this.environment.PARSER_MODE === "inline") {
        const result = await runParserChild({
          filePath: this.store.pathFor(storageKey),
          mediaType,
          maximumTextCharacters: this.environment.PARSER_MAX_TEXT_CHARS,
          timeoutMs: this.environment.PARSER_TIMEOUT_MS,
        });
        if (result.ok)
          await this.repository.markReady(principal, id, result.result);
        else {
          await this.repository.markRejected(principal, id, result.errorCode);
          await this.store.delete(storageKey);
        }
      } else {
        await this.store.putJsonAtomic(
          parserMessageKey(principal.workspaceId, id),
          {
            state: "request",
            storageKey,
            mediaType,
            maximumTextCharacters: this.environment.PARSER_MAX_TEXT_CHARS,
            timeoutMs: this.environment.PARSER_TIMEOUT_MS,
          },
        );
      }
      return id;
    } catch (error) {
      await this.store.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }

  public async refreshSidecarResult(
    principal: WorkspacePrincipal,
    id: string,
  ): Promise<void> {
    const source = await this.repository.get(principal, id);
    if (
      source.status !== "processing" ||
      this.environment.PARSER_MODE !== "sidecar"
    )
      return;
    const key = parserMessageKey(principal.workspaceId, id);
    const parsed = sidecarResultSchema.safeParse(
      await this.store.readJson(key).catch(() => null),
    );
    if (!parsed.success) return;
    if (parsed.data.ok)
      await this.repository.markReady(principal, id, parsed.data.result);
    else {
      await this.repository.markRejected(principal, id, parsed.data.errorCode);
      await this.store.delete(source.storage_key);
    }
    await this.store.delete(key);
  }

  public async deleteBinaryAndRecord(
    principal: WorkspacePrincipal,
    id: string,
  ): Promise<void> {
    const storageKey = await this.repository.markDeleted(principal, id);
    await Promise.all([
      this.store.delete(storageKey),
      this.store.delete(parserMessageKey(principal.workspaceId, id)),
    ]);
  }
}
