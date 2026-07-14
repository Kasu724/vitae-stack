import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const storageKeyPattern = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:bin|json)$/u;

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export class InvalidStorageKeyError extends Error {
  public constructor() {
    super("Invalid private storage key.");
    this.name = "InvalidStorageKeyError";
  }
}

export interface StagedArtifactDeletion {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export class FilesystemArtifactStore {
  private readonly root: string;

  public constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    if (!storageKeyPattern.test(key)) throw new InvalidStorageKeyError();
    const resolved = path.resolve(this.root, ...key.split("/"));
    if (!resolved.startsWith(`${this.root}${path.sep}`))
      throw new InvalidStorageKeyError();
    return resolved;
  }

  public async putExclusive(key: string, bytes: Uint8Array): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
  }

  public pathFor(key: string): string {
    return this.resolve(key);
  }

  public async putJsonAtomic(key: string, value: unknown): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, target);
  }

  public async read(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  public async readJson(key: string): Promise<unknown> {
    return JSON.parse((await this.read(key)).toString("utf8"));
  }

  public async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  public async stageDelete(keys: string[]): Promise<StagedArtifactDeletion> {
    const staged: Array<{ original: string; temporary: string }> = [];
    try {
      for (const original of [...new Set(keys)]) {
        const [workspaceId] = original.split("/", 1);
        const temporary = `${workspaceId}/${crypto.randomUUID()}.bin`;
        try {
          await rename(this.resolve(original), this.resolve(temporary));
          staged.push({ original, temporary });
        } catch (error) {
          if (!isNotFound(error)) throw error;
        }
      }
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      for (const item of staged.toReversed())
        try {
          await rename(
            this.resolve(item.temporary),
            this.resolve(item.original),
          );
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      if (rollbackErrors.length)
        throw new AggregateError(
          [error, ...rollbackErrors],
          "Private artifact deletion could not be staged safely.",
        );
      throw error;
    }

    return {
      commit: async () => {
        await Promise.all(
          staged.map((item) =>
            rm(this.resolve(item.temporary), { force: true }),
          ),
        );
      },
      rollback: async () => {
        for (const item of staged.toReversed())
          try {
            await rename(
              this.resolve(item.temporary),
              this.resolve(item.original),
            );
          } catch (error) {
            if (!isNotFound(error)) throw error;
          }
      },
    };
  }

  public async listKeysOlderThan(
    ageMs: number,
    now = Date.now(),
  ): Promise<string[]> {
    const keys: string[] = [];
    let workspaces;
    try {
      workspaces = await readdir(this.root, { withFileTypes: true });
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    for (const workspace of workspaces) {
      if (!workspace.isDirectory() || !/^[0-9a-f-]{36}$/u.test(workspace.name))
        continue;
      const directory = path.join(this.root, workspace.name);
      let files;
      try {
        files = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (isNotFound(error)) continue;
        throw error;
      }
      for (const file of files) {
        const key = `${workspace.name}/${file.name}`;
        if (!file.isFile() || !storageKeyPattern.test(key)) continue;
        let details;
        try {
          details = await stat(path.join(directory, file.name));
        } catch (error) {
          if (!isNotFound(error)) throw error;
          details = null;
        }
        if (details && now - details.mtimeMs >= ageMs) keys.push(key);
      }
    }
    return keys.sort();
  }
}

export function sourceStorageKey(
  workspaceId: string,
  sourceId: string,
): string {
  return `${workspaceId}/${sourceId}.bin`;
}

export function parserMessageKey(
  workspaceId: string,
  sourceId: string,
): string {
  return `${workspaceId}/${sourceId}.json`;
}

export function exportArtifactStorageKey(
  workspaceId: string,
  artifactId: string,
): string {
  return `${workspaceId}/${artifactId}.bin`;
}

export function portabilityBlobStorageKey(
  workspaceId: string,
  resourceId: string,
): string {
  return `${workspaceId}/${resourceId}.bin`;
}
