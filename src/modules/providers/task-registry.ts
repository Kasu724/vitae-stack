import { z } from "zod";

import { aiTaskIdSchema, type AiTaskId } from "./contracts";

export const taskManifestSchema = z.object({
  id: aiTaskIdSchema,
  version: z.string().regex(/^ai-\d{2}\.v\d+$/u),
  label: z.string().min(1).max(100),
  requiredCapabilities: z.array(z.enum(["structuredOutput"])),
  defaultTemperature: z.number().min(0).max(2),
  maxOutputTokens: z.number().int().min(64).max(16_384),
  timeoutMs: z.number().int().min(1_000).max(120_000),
});

export type TaskManifest = z.infer<typeof taskManifestSchema>;

const definitions = [
  ["AI-01", "Career-fact extraction", 16_384],
  ["AI-02", "Job-requirement extraction", 4096],
  ["AI-03", "Evidence retrieval", 2048],
  ["AI-04", "Evidence ranking", 2048],
  ["AI-05", "Resume section selection", 2048],
  ["AI-06", "Resume bullet revision", 4096],
  ["AI-07", "Cover-letter planning", 2048],
  ["AI-08", "Cover-letter drafting", 4096],
  ["AI-09", "Change explanation", 2048],
  ["AI-10", "Quality feedback", 2048],
  ["AI-11", "ATS analysis", 4096],
] as const satisfies ReadonlyArray<readonly [AiTaskId, string, number]>;

const taskTimeouts: Partial<Record<AiTaskId, number>> = {
  "AI-01": 90_000,
};

export const taskRegistry = new Map<AiTaskId, TaskManifest>(
  definitions.map(([id, label, maxOutputTokens]) => [
    id,
    taskManifestSchema.parse({
      id,
      version: `${id.toLowerCase()}.v1`,
      label,
      requiredCapabilities: ["structuredOutput"],
      defaultTemperature: 0,
      maxOutputTokens,
      timeoutMs: taskTimeouts[id] ?? 30_000,
    }),
  ]),
);

export function getTaskManifest(id: AiTaskId): TaskManifest {
  const manifest = taskRegistry.get(id);
  if (!manifest) throw new Error("Unknown AI task.");
  return manifest;
}
