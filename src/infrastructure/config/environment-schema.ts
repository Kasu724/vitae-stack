import { z } from "zod";

const serverEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    APP_BASE_URL: z.url().default("http://127.0.0.1:3000"),
    APP_BIND_HOST: z.string().min(1).default("127.0.0.1"),
    DATABASE_PATH: z.string().min(1).default("./var/vitae.sqlite"),
    ARTIFACT_STORAGE_ROOT: z.string().min(1).default("./var/private/artifacts"),
    PARSER_QUEUE_ROOT: z.string().min(1).default("./var/private/parser-queue"),
    JOB_FETCH_QUEUE_ROOT: z
      .string()
      .min(1)
      .default("./var/private/job-fetch-queue"),
    UPLOAD_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(50 * 1024 * 1024)
      .default(10 * 1024 * 1024),
    PARSER_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(120_000)
      .default(15_000),
    PARSER_MAX_TEXT_CHARS: z.coerce
      .number()
      .int()
      .min(10_000)
      .max(5_000_000)
      .default(500_000),
    PARSER_MODE: z.enum(["inline", "sidecar"]).default("inline"),
    JOB_FETCH_MODE: z.enum(["inline", "sidecar", "disabled"]).default("inline"),
    CREDENTIAL_ENCRYPTION_KEY: z.string().optional(),
    CREDENTIAL_KEY_VERSION: z.coerce.number().int().positive().default(1),
    AI_PRIVATE_ENDPOINT_ALLOWLIST: z.string().max(4096).default(""),
    TELEMETRY_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .superRefine((environment, context) => {
    const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

    const applicationHost = new URL(environment.APP_BASE_URL).hostname;
    if (
      !loopbackHosts.has(environment.APP_BIND_HOST) ||
      !loopbackHosts.has(applicationHost)
    ) {
      context.addIssue({
        code: "custom",
        path: ["APP_BIND_HOST"],
        message: "local-only mode requires loopback bind and base URL",
      });
    }
  });

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function parseServerEnvironment(
  input: Record<string, string | undefined>,
): ServerEnvironment {
  return serverEnvironmentSchema.parse(input);
}
