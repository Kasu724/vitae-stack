// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FilesystemArtifactStore,
  InvalidStorageKeyError,
} from "@/infrastructure/artifacts/filesystem-store";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("private filesystem artifact store", () => {
  it("uses opaque bounded keys and exclusive writes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "vitae-store-"));
    temporaryDirectories.push(root);
    const store = new FilesystemArtifactStore(root);
    const key = `${crypto.randomUUID()}/${crypto.randomUUID()}.bin`;
    await store.putExclusive(key, Buffer.from("synthetic private bytes"));
    await expect(store.read(key)).resolves.toEqual(
      Buffer.from("synthetic private bytes"),
    );
    await expect(
      store.putExclusive(key, Buffer.from("overwrite")),
    ).rejects.toMatchObject({ code: "EEXIST" });
  });

  it("rejects traversal and non-opaque names", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "vitae-store-"));
    temporaryDirectories.push(root);
    const store = new FilesystemArtifactStore(root);
    for (const key of [
      "../outside.bin",
      `${crypto.randomUUID()}/../../outside.bin`,
      `${crypto.randomUUID()}/resume.pdf`,
    ]) {
      expect(() => store.pathFor(key)).toThrow(InvalidStorageKeyError);
    }
  });

  it("atomically replaces private queue messages", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "vitae-queue-"));
    temporaryDirectories.push(root);
    const store = new FilesystemArtifactStore(root);
    const key = `${crypto.randomUUID()}/${crypto.randomUUID()}.json`;
    await store.putJsonAtomic(key, { state: "request" });
    await store.putJsonAtomic(key, { state: "result", ok: true });
    await expect(store.readJson(key)).resolves.toEqual({
      state: "result",
      ok: true,
    });
  });

  it("stages private-file deletion for database commit or rollback", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "vitae-staged-delete-"));
    temporaryDirectories.push(root);
    const store = new FilesystemArtifactStore(root);
    const key = `${crypto.randomUUID()}/${crypto.randomUUID()}.bin`;
    const bytes = Buffer.from("staged private bytes");
    await store.putExclusive(key, bytes);

    const rolledBack = await store.stageDelete([key, key]);
    await expect(store.read(key)).rejects.toMatchObject({ code: "ENOENT" });
    await rolledBack.rollback();
    await expect(store.read(key)).resolves.toEqual(bytes);

    const committed = await store.stageDelete([key]);
    await committed.commit();
    await expect(store.read(key)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await store.listKeysOlderThan(0, Date.now() + 1_000)).toEqual([]);
  });

  it("enumerates only aged opaque keys for orphan reconciliation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "vitae-orphans-"));
    temporaryDirectories.push(root);
    const store = new FilesystemArtifactStore(root);
    const key = `${crypto.randomUUID()}/${crypto.randomUUID()}.bin`;
    await store.putExclusive(key, Buffer.from("orphan fixture"));
    expect(await store.listKeysOlderThan(60_000, Date.now())).toEqual([]);
    expect(await store.listKeysOlderThan(60_000, Date.now() + 61_000)).toEqual([
      key,
    ]);
  });
});
