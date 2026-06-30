import { readdir } from "node:fs/promises";
import path from "node:path";

import { FilesystemArtifactStore } from "../src/infrastructure/artifacts/filesystem-store";
import { fetchPublicJobDescription } from "../src/modules/job-fetch/fetcher";
import { UnsafeJobUrlError } from "../src/modules/job-fetch/network-policy";
import { jobFetchRequestSchema } from "../src/modules/job-fetch/protocol";

const queueRoot = path.resolve(
  process.env.JOB_FETCH_QUEUE_ROOT ?? "/var/lib/vitae/job-fetch-queue",
);
const queue = new FilesystemArtifactStore(queueRoot);

async function scan(): Promise<void> {
  const workspaces = await readdir(queueRoot, { withFileTypes: true }).catch(
    () => [],
  );
  for (const workspace of workspaces) {
    if (!workspace.isDirectory() || !/^[0-9a-f-]{36}$/u.test(workspace.name))
      continue;
    const files = await readdir(path.join(queueRoot, workspace.name), {
      withFileTypes: true,
    }).catch(() => []);
    for (const file of files) {
      if (!file.isFile() || !/^[0-9a-f-]{36}\.json$/u.test(file.name)) continue;
      const key = `${workspace.name}/${file.name}`;
      const parsed = jobFetchRequestSchema.safeParse(
        await queue.readJson(key).catch(() => null),
      );
      if (!parsed.success) continue;
      try {
        const result = await fetchPublicJobDescription(parsed.data.url);
        await queue.putJsonAtomic(key, {
          schemaVersion: 1,
          state: "result",
          operationId: parsed.data.operationId,
          ok: true,
          result,
        });
      } catch (error) {
        await queue.putJsonAtomic(key, {
          schemaVersion: 1,
          state: "result",
          operationId: parsed.data.operationId,
          ok: false,
          errorCode:
            error instanceof UnsafeJobUrlError ? error.code : "FETCH_FAILED",
        });
      }
    }
  }
}

process.stdout.write("Job fetch sidecar ready.\n");
for (;;) {
  await scan();
  await new Promise((resolve) => setTimeout(resolve, 500));
}
