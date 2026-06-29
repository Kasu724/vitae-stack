import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

import {
  accounts,
  rateLimits,
  sessions,
  users,
  verifications,
} from "../../../db/schema";
import type { Database } from "../../infrastructure/database/connection";

export interface AuthFactoryOptions {
  allowSignUp: boolean;
  baseURL: string;
  database: Database;
  secret: string;
  secureCookies: boolean;
}

export function createVitaeAuth(options: AuthFactoryOptions) {
  const trustedOrigin = new URL(options.baseURL).origin;

  return betterAuth({
    appName: "Vitae Stack",
    baseURL: options.baseURL,
    basePath: "/api/auth",
    secret: options.secret,
    database: drizzleAdapter(options.database, {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        rateLimit: rateLimits,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !options.allowSignUp,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: false,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 15,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/forget-password": { window: 300, max: 3 },
        "/reset-password": { window: 300, max: 3 },
      },
    },
    trustedOrigins: [trustedOrigin],
    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: "vitae",
      useSecureCookies: options.secureCookies,
      trustedProxyHeaders: false,
    },
    telemetry: { enabled: false },
  });
}

export type VitaeAuth = ReturnType<typeof createVitaeAuth>;
