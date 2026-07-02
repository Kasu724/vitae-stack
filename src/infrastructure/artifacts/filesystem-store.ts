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

export class InvalidStorageKeyError extends Error {
  public constructor() {
    super("Invalid private storage key.");
    this.name = "InvalidStorageKeyError";
  }
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

  public async listKeysOlderThan(
    ageMs: number,
    now = Date.now(),
  ): Promise<string[]> {
    const keys: string[] = [];
    const workspaces = await readdir(this.root, { withFileTypes: true }).catch(
      () => [],
    );
    for (const workspace of workspaces) {
      if (!workspace.isDirectory() || !/^[0-9a-f-]{36}$/u.test(workspace.name))
        continue;
      const directory = path.join(this.root, workspace.name);
      const files = await readdir(directory, { withFileTypes: true }).catch(
        () => [],
      );
      for (const file of files) {
        const key = `${workspace.name}/${file.name}`;
        if (!file.isFile() || !storageKeyPattern.test(key)) continue;
        const details = await stat(path.join(directory, file.name)).catch(
          () => null,
        );
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
