import { z } from "zod";

const serverEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    APP_BASE_URL: z.url().default("http://127.0.0.1:3000"),
    APP_BIND_HOST: z.string().min(1).default("127.0.0.1"),
    DATABASE_URL: z
      .string()
      .startsWith("postgresql://")
      .default(
        "postgresql://vitae_app:vitae-app-dev-only@127.0.0.1:5432/vitae",
      ),
    AUTH_MODE: z.enum(["password", "trusted-local"]).default("password"),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32)
      .default("development-only-auth-secret-change-me"),
    BETTER_AUTH_URL: z.url().default("http://127.0.0.1:3000"),
    REGISTRATION_MODE: z.literal("closed").default("closed"),
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
    TRUSTED_LOCAL_DANGER_ACK: z.enum(["true", "false"]).default("false"),
    TELEMETRY_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .superRefine((environment, context) => {
    const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

    if (environment.AUTH_MODE === "trusted-local") {
      const authHost = new URL(environment.BETTER_AUTH_URL).hostname;
      if (
        !loopbackHosts.has(environment.APP_BIND_HOST) ||
        !loopbackHosts.has(authHost)
      ) {
        context.addIssue({
          code: "custom",
          path: ["AUTH_MODE"],
          message: "trusted-local mode requires loopback bind and base URL",
        });
      }
      if (
        environment.NODE_ENV === "production" &&
        environment.TRUSTED_LOCAL_DANGER_ACK !== "true"
      ) {
        context.addIssue({
          code: "custom",
          path: ["TRUSTED_LOCAL_DANGER_ACK"],
          message:
            "production trusted-local mode requires explicit acknowledgement",
        });
      }
    }

    if (
      environment.NODE_ENV === "production" &&
      environment.BETTER_AUTH_SECRET ===
        "development-only-auth-secret-change-me"
    ) {
      context.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_SECRET"],
        message:
          "production requires an operator-provided authentication secret",
      });
    }

    if (
      environment.NODE_ENV === "production" &&
      environment.PARSER_MODE !== "sidecar"
    ) {
      context.addIssue({
        code: "custom",
        path: ["PARSER_MODE"],
        message: "production requires the no-network parser sidecar",
      });
    }
    if (
      environment.NODE_ENV === "production" &&
      environment.JOB_FETCH_MODE === "inline"
    ) {
      context.addIssue({
        code: "custom",
        path: ["JOB_FETCH_MODE"],
        message:
          "production URL fetching must use the no-credential sidecar or be disabled",
      });
    }
  });

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function parseServerEnvironment(
  input: Record<string, string | undefined>,
): ServerEnvironment {
  return serverEnvironmentSchema.parse(input);
}
