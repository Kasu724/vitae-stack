import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
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
