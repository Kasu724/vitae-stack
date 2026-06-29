import { createDatabaseConnection } from "@/infrastructure/database/connection";
import { createVitaeAuth } from "@/modules/auth/auth-factory";
import { provisionPersonalWorkspace } from "@/modules/auth/workspace-access";

export const syntheticAuthUser = {
  email: "e2e-owner@example.test",
  name: "E2E Synthetic Owner",
  password: "synthetic-e2e-password-123",
};

export async function ensureSyntheticAuthUser(): Promise<void> {
  const connection = createDatabaseConnection(
    process.env.DATABASE_URL ??
      "postgresql://vitae_app:vitae-app-dev-only@127.0.0.1:5432/vitae",
    { maxConnections: 2 },
  );
  try {
    // Browser suites are repeatable against a persistent local test database.
    // This helper is never used by the application or production runtime.
    await connection.pool.query("DELETE FROM rate_limits");
    const existing = await connection.pool.query<{ id: string; name: string }>(
      "SELECT id, name FROM users WHERE email = $1",
      [syntheticAuthUser.email],
    );
    if (existing.rows[0]) return;

    const auth = createVitaeAuth({
      allowSignUp: true,
      baseURL: "http://127.0.0.1:3000",
      database: connection.database,
      secret: "development-only-auth-secret-change-me",
      secureCookies: false,
    });
    const signup = await auth.api.signUpEmail({ body: syntheticAuthUser });
    await provisionPersonalWorkspace(connection.pool, {
      userId: signup.user.id,
      displayName: signup.user.name,
      mode: "password",
    });
  } finally {
    await connection.pool.end();
  }
}
