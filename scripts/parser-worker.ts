import { readdir } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { FilesystemArtifactStore } from "../src/infrastructure/artifacts/filesystem-store";
import { runParserChild } from "../src/modules/ingestion/parser-runner";

const root = path.resolve(
  process.env.ARTIFACT_STORAGE_ROOT ?? "/var/lib/vitae/artifacts",
);
const store = new FilesystemArtifactStore(root);
const requestSchema = z.object({
  state: z.literal("request"),
  storageKey: z.string(),
  mediaType: z.enum([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/markdown",
    "text/plain",
    "application/json",
  ]),
  maximumTextCharacters: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
});

async function scan(): Promise<void> {
  await readdir(root, { withFileTypes: true })
    .catch(() => [])
    .then(async (workspaces) => {
      for (const workspace of workspaces) {
        if (
          !workspace.isDirectory() ||
          !/^[0-9a-f-]{36}$/u.test(workspace.name)
        )
          continue;
        const directory = path.join(root, workspace.name);
        const files = await readdir(directory, { withFileTypes: true }).catch(
          () => [],
        );
        for (const file of files) {
          if (!file.isFile() || !/^[0-9a-f-]{36}\.json$/u.test(file.name))
            continue;
          const key = `${workspace.name}/${file.name}`;
          const parsed = requestSchema.safeParse(
            await store.readJson(key).catch(() => null),
          );
          if (!parsed.success) continue;
          const sourcePath = path.join(
            root,
            ...parsed.data.storageKey.split("/"),
          );
          const result = await runParserChild({
            filePath: sourcePath,
            mediaType: parsed.data.mediaType,
            maximumTextCharacters: parsed.data.maximumTextCharacters,
            timeoutMs: parsed.data.timeoutMs,
          });
          await store.putJsonAtomic(key, { state: "result", ...result });
        }
      }
    });
}

process.stdout.write("Parser sidecar ready.\n");
for (;;) {
  await scan();
  await new Promise((resolve) => setTimeout(resolve, 500));
}
