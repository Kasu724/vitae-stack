import "server-only";

import { readServerEnvironment } from "@/infrastructure/config/environment";

import {
  createDatabaseConnection,
  type Database,
  type DatabaseConnection,
} from "./connection";
import type { Pool } from "./sqlite-pool";

const runtimeGlobal = globalThis as typeof globalThis & {
  vitaeRuntimeConnection?: DatabaseConnection;
};

function getRuntimeConnection(): DatabaseConnection {
  if (!runtimeGlobal.vitaeRuntimeConnection) {
    const environment = readServerEnvironment();
    runtimeGlobal.vitaeRuntimeConnection = createDatabaseConnection(
      environment.DATABASE_PATH,
    );
  }

  return runtimeGlobal.vitaeRuntimeConnection;
}

export function getRuntimePool(): Pool {
  return getRuntimeConnection().pool;
}

export function getRuntimeDatabase(): Database {
  return getRuntimeConnection().database;
}
