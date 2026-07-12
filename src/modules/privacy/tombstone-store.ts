import {
  link,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import { z } from "zod";

const uuidPattern = /^[0-9a-f-]{36}$/u;

export const deletionTombstoneSchema = z.object({
  schemaVersion: z.literal(1),
  operationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  requesterUserHash: z.string().regex(/^[0-9a-f]{64}$/u),
  requestedAt: z.iso.datetime(),
  backupExpiresAt: z.iso.datetime(),
});

export type DeletionTombstone = z.infer<typeof deletionTombstoneSchema>;

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function parseTombstone(value: string): DeletionTombstone {
  return deletionTombstoneSchema.parse(JSON.parse(value) as unknown);
}

export class DeletionTombstoneStore {
  private readonly directory: string;

  public constructor(artifactRoot: string) {
    this.directory = path.join(path.resolve(artifactRoot), ".deletions");
  }

  private file(workspaceId: string): string {
    if (!uuidPattern.test(workspaceId)) throw new Error("INVALID_WORKSPACE_ID");
    return path.join(this.directory, `${workspaceId}.json`);
  }

  public async put(tombstone: DeletionTombstone): Promise<void> {
    const value = deletionTombstoneSchema.parse(tombstone);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const target = this.file(value.workspaceId);
    let existing: string | null;
    try {
      existing = await readFile(target, "utf8");
    } catch (error) {
      if (!hasErrorCode(error, "ENOENT")) throw error;
      existing = null;
    }
    if (existing) {
      const parsed = parseTombstone(existing);
      if (parsed.operationId === value.operationId) return;
      throw new Error("DELETION_TOMBSTONE_CONFLICT");
    }
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(value)}\n`, {
        mode: 0o600,
        flag: "wx",
      });
      try {
        await link(temporary, target);
      } catch (error) {
        if (!hasErrorCode(error, "EEXIST")) throw error;
        const concurrent = parseTombstone(await readFile(target, "utf8"));
        if (concurrent.operationId !== value.operationId)
          throw new Error("DELETION_TOMBSTONE_CONFLICT");
      }
    } finally {
      await rm(temporary, { force: true });
    }
  }

  public async has(workspaceId: string): Promise<boolean> {
    try {
      const parsed = parseTombstone(
        await readFile(this.file(workspaceId), "utf8"),
      );
      if (parsed.workspaceId !== workspaceId)
        throw new Error("DELETION_TOMBSTONE_WORKSPACE_MISMATCH");
      return true;
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return false;
      throw error;
    }
  }

  public async list(): Promise<DeletionTombstone[]> {
    let files: Dirent<string>[];
    try {
      files = await readdir(this.directory, { withFileTypes: true });
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return [];
      throw error;
    }
    const tombstones: DeletionTombstone[] = [];
    for (const file of files.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      if (!file.isFile() || !/^[0-9a-f-]{36}\.json$/u.test(file.name)) continue;
      const parsed = parseTombstone(
        await readFile(path.join(this.directory, file.name), "utf8"),
      );
      if (`${parsed.workspaceId}.json` !== file.name)
        throw new Error("DELETION_TOMBSTONE_WORKSPACE_MISMATCH");
      tombstones.push(parsed);
    }
    return tombstones;
  }
}
