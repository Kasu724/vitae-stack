import { z } from "zod";

export const jobFetchRequestSchema = z.object({
  schemaVersion: z.literal(1),
  state: z.literal("request"),
  operationId: z.string().uuid(),
  url: z.url(),
});

const fetchedSchema = z.object({
  requestedUrl: z.url(),
  finalUrl: z.url(),
  finalOrigin: z.url(),
  retrievedAt: z.iso.datetime(),
  contentType: z.enum(["text/html", "text/plain"]),
  text: z.string().min(1).max(500_000),
  contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  redirectCount: z.number().int().min(0).max(3),
});

export const jobFetchResultSchema = z.discriminatedUnion("ok", [
  z.object({
    schemaVersion: z.literal(1),
    state: z.literal("result"),
    operationId: z.string().uuid(),
    ok: z.literal(true),
    result: fetchedSchema,
  }),
  z.object({
    schemaVersion: z.literal(1),
    state: z.literal("result"),
    operationId: z.string().uuid(),
    ok: z.literal(false),
    errorCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,99}$/u),
  }),
]);

export function jobFetchMessageKey(
  workspaceId: string,
  operationId: string,
): string {
  return `${workspaceId}/${operationId}.json`;
}
