import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
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
    const existing = await readFile(target, "utf8").catch(() => null);
    if (existing) {
      const parsed = deletionTombstoneSchema.safeParse(JSON.parse(existing));
      if (parsed.success && parsed.data.operationId === value.operationId)
        return;
      throw new Error("DELETION_TOMBSTONE_CONFLICT");
    }
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, target);
  }

  public async has(workspaceId: string): Promise<boolean> {
    return readFile(this.file(workspaceId)).then(
      () => true,
      () => false,
    );
  }

  public async list(): Promise<DeletionTombstone[]> {
    const files = await readdir(this.directory, { withFileTypes: true }).catch(
      () => [],
    );
    const tombstones: DeletionTombstone[] = [];
    for (const file of files) {
      if (!file.isFile() || !/^[0-9a-f-]{36}\.json$/u.test(file.name)) continue;
      const parsed = deletionTombstoneSchema.safeParse(
        JSON.parse(
          await readFile(path.join(this.directory, file.name), "utf8"),
        ),
      );
      if (parsed.success) tombstones.push(parsed.data);
    }
    return tombstones;
  }
}
