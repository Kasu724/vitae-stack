import "server-only";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { getRuntimeDatabase } from "@/infrastructure/database/runtime";

import { createVitaeAuth, type VitaeAuth } from "./auth-factory";

const authGlobal = globalThis as typeof globalThis & {
  vitaeAuth?: VitaeAuth;
};

export function getAuth(): VitaeAuth {
  const environment = readServerEnvironment();
  if (environment.AUTH_MODE !== "password") {
    throw new Error(
      "Password authentication is disabled in trusted-local mode.",
    );
  }

  if (!authGlobal.vitaeAuth) {
    authGlobal.vitaeAuth = createVitaeAuth({
      allowSignUp: process.env.VITAE_BOOTSTRAP_ENABLED === "true",
      baseURL: environment.BETTER_AUTH_URL,
      database: getRuntimeDatabase(),
      secret: environment.BETTER_AUTH_SECRET,
      secureCookies:
        environment.NODE_ENV === "production" &&
        new URL(environment.BETTER_AUTH_URL).protocol === "https:",
    });
  }

  return authGlobal.vitaeAuth;
}
