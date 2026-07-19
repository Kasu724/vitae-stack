import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type StatementResultingChanges } from "node:sqlite";

export interface QueryResult<Row extends object = Record<string, unknown>> {
  rows: Row[];
  rowCount: number;
}

export interface Queryable {
  query<Row extends object = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<QueryResult<Row>>;
}

const jsonColumns = new Set([
  "attributes",
  "capabilities",
  "content",
  "deleted_counts",
  "evidence",
  "evidence_ids",
  "location",
  "manifest",
  "measured",
  "metadata",
  "parse_metadata",
  "proposed_value",
  "result",
  "row",
  "signals",
  "source_locator",
  "task_assignments",
  "threshold",
  "usage",
  "value",
  "writing_preferences",
]);

const arrayColumns = new Set([
  "aliases",
  "career_goals",
  "tags",
  "target_roles",
  "warnings",
]);

const booleanColumns = new Set([
  "blocker",
  "email_verified",
  "is_current",
  "possible_duplicate",
  "source_available",
]);

function normalizeParameter(
  value: unknown,
): null | number | string | Uint8Array {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "bigint" || typeof value === "number")
    return Number(value);
  if (typeof value === "string" || value instanceof Uint8Array) return value;
  return JSON.stringify(value);
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function normalizeRow<Row extends object>(row: Record<string, unknown>): Row {
  const normalized: Record<string, unknown> = { ...row };
  for (const [key, value] of Object.entries(normalized)) {
    if (jsonColumns.has(key) || arrayColumns.has(key)) {
      normalized[key] = parseJson(value);
      continue;
    }
    if (
      booleanColumns.has(key) ||
      key.startsWith("is_") ||
      key.startsWith("has_")
    ) {
      normalized[key] = Boolean(value);
      continue;
    }
    if (key.endsWith("_at") && typeof value === "string") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) normalized[key] = parsed;
    }
  }
  return normalized as Row;
}

function intervalMilliseconds(amount: string, unit: string): number {
  const value = Number(amount);
  const factors: Record<string, number> = {
    millisecond: 1,
    milliseconds: 1,
    minute: 60_000,
    minutes: 60_000,
    hour: 3_600_000,
    hours: 3_600_000,
    day: 86_400_000,
    days: 86_400_000,
  };
  const factor = factors[unit.toLowerCase()];
  if (!factor) throw new Error(`Unsupported SQL interval unit: ${unit}`);
  return value * factor;
}

function transformSql(sql: string): {
  parameterOrder: number[];
  sql: string;
} {
  let transformed = sql
    .replace(
      /now\(\)\s*\+\s*\(\$(\d+)\s*\*\s*interval\s*'1 millisecond'\)/giu,
      "date_add(now(), $$$1)",
    )
    .replace(
      /now\(\)\s*([+-])\s*interval\s*'(\d+)\s+(millisecond|milliseconds|minute|minutes|hour|hours|day|days)'/giu,
      (_, sign: string, amount: string, unit: string) =>
        `date_add(now(), ${sign === "-" ? -1 : 1} * ${intervalMilliseconds(amount, unit)})`,
    )
    .replace(
      /jsonb_set\(([^,]+),\s*ARRAY\[\$(\d+)\],\s*to_jsonb\(\$(\d+)(?:::[^)]+)?\),\s*true\)/giu,
      "json_set($1, '$.' || $$$2, $$$3)",
    )
    .replace(
      /jsonb_set\(([^,]+),\s*'\{([^}]+)\}',\s*to_jsonb\(([^)]+)\)(?:,\s*true)?\)/giu,
      "json_set($1, '$.$2', $3)",
    )
    .replace(
      /([a-z0-9_]+)\s*=\s*\1\s*-\s*\$(\d+)/giu,
      "$1 = json_remove($1, '$.' || $$$2)",
    )
    .replace(/::(?:"[^"]+"|[a-z_][a-z0-9_]*(?:\[\])?)/giu, "")
    .replace(/\s+FOR\s+UPDATE(?:\s+OF\s+[a-z0-9_.,"]+)?/giu, "")
    .replace(/\s+SKIP\s+LOCKED/giu, "")
    .replace(/\bILIKE\b/giu, "LIKE")
    .replace(/\bjsonb_agg\b/giu, "json_group_array")
    .replace(/\barray_agg\b/giu, "json_group_array")
    .replace(/\bjsonb_build_object\b/giu, "json_object")
    .replace(/\bto_jsonb\(([^)]+)\)/giu, "$1")
    .replace(/\bARRAY\[\]/giu, "'[]'")
    .replace(
      /\bUPDATE\s+("?[a-z_][a-z0-9_]*"?)\s+([a-z_][a-z0-9_]*)\s+SET\b/giu,
      "UPDATE $1 AS $2 SET",
    )
    .replace(
      /\bDELETE\s+FROM\s+(users)\s+(u)\s+WHERE\b/giu,
      "DELETE FROM $1 AS $2 WHERE",
    )
    .replace(
      /([a-z0-9_.$"]+)\s*=\s*ANY\(([^)]+)\)/giu,
      "$1 IN (SELECT value FROM json_each($2))",
    );

  transformed = transformed.replace(
    /([a-z0-9_.>\-'"()]+)\s*~\s*('(?:[^']|'')*')/giu,
    "regexp($2, $1)",
  );

  const parameterOrder: number[] = [];
  transformed = transformed.replace(/\$(\d+)/gu, (_, index: string) => {
    parameterOrder.push(Number(index) - 1);
    return "?";
  });
  return { parameterOrder, sql: transformed };
}

class Mutex {
  private tail = Promise.resolve();

  public async acquire(): Promise<() => void> {
    let release: () => void = () => undefined;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.tail;
    this.tail = previous.then(() => next);
    await previous;
    return release;
  }
}

export class SqliteClient implements Queryable {
  private released = false;

  public constructor(
    private readonly pool: SqlitePool,
    private readonly releaseLock: () => void,
  ) {}

  public async query<Row extends object = Record<string, unknown>>(
    sql: string,
    parameters: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    if (this.released) throw new Error("SQLite client has been released.");
    return this.pool.execute<Row>(sql, parameters);
  }

  public release(): void {
    if (this.released) return;
    this.released = true;
    this.releaseLock();
  }

  public authorizeWorkspaceDeletion(): void {
    if (this.released) throw new Error("SQLite client has been released.");
    this.pool.authorizeWorkspaceDeletion();
  }
}

export class SqlitePool implements Queryable {
  private readonly client: DatabaseSync;
  private readonly mutex = new Mutex();
  private deletionAuthorized = false;
  private statementTime: string | undefined;
  private closed = false;

  public constructor(public readonly databasePath: string) {
    if (databasePath !== ":memory:")
      mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
    this.client = new DatabaseSync(databasePath, {
      enableForeignKeyConstraints: true,
      timeout: 5_000,
    });
    this.client.function(
      "now",
      () => this.statementTime ?? new Date().toISOString(),
    );
    this.client.function("date_add", (value, milliseconds) =>
      new Date(
        new Date(String(value)).getTime() + Number(milliseconds),
      ).toISOString(),
    );
    this.client.function("regexp", (pattern, value) =>
      typeof value === "string" && new RegExp(String(pattern), "u").test(value)
        ? 1
        : 0,
    );
    this.client.function(
      "concat_ws",
      { varargs: true },
      (separator, ...values) =>
        values
          .filter((value) => value !== null && value !== undefined)
          .join(String(separator)),
    );
    this.client.function("least", { varargs: true }, (...values) =>
      Math.min(...values.map(Number)),
    );
    this.client.function("greatest", { varargs: true }, (...values) =>
      Math.max(...values.map(Number)),
    );
    this.client.function("lpad", (value, length, padding) =>
      String(value).padStart(Number(length), String(padding)),
    );
    this.client.function(
      "split_part",
      (value, separator, field) =>
        String(value).split(String(separator))[Number(field) - 1] ?? "",
    );
    this.client.function("workspace_deletion_authorized", () =>
      this.deletionAuthorized ? 1 : 0,
    );
    this.client.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000;",
    );
  }

  public async connect(): Promise<SqliteClient> {
    if (this.closed) throw new Error("SQLite database is closed.");
    const release = await this.mutex.acquire();
    return new SqliteClient(this, release);
  }

  public async query<Row extends object = Record<string, unknown>>(
    sql: string,
    parameters: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    if (this.closed) throw new Error("SQLite database is closed.");
    const release = await this.mutex.acquire();
    try {
      return this.execute<Row>(sql, parameters);
    } finally {
      release();
    }
  }

  public execute<Row extends object>(
    sql: string,
    parameters: readonly unknown[],
  ): QueryResult<Row> {
    const compact = sql.trim();
    if (/^SELECT\s+pg_advisory_(?:xact_)?(?:lock|unlock)/iu.test(compact))
      return { rows: [], rowCount: 0 };
    if (/^SET\b/iu.test(compact)) return { rows: [], rowCount: 0 };
    if (/^BEGIN\b/iu.test(compact)) {
      this.client.exec("BEGIN IMMEDIATE");
      return { rows: [], rowCount: 0 };
    }
    if (/^(?:COMMIT|ROLLBACK)\b/iu.test(compact)) {
      this.client.exec(
        compact.toUpperCase().startsWith("COMMIT") ? "COMMIT" : "ROLLBACK",
      );
      this.deletionAuthorized = false;
      return { rows: [], rowCount: 0 };
    }

    const transformed = transformSql(sql);
    this.statementTime = new Date().toISOString();
    try {
      const statement = this.client.prepare(transformed.sql);
      const bindings = transformed.parameterOrder.map((index) =>
        normalizeParameter(parameters[index]),
      );
      const returnsRows =
        /^\s*(?:SELECT|PRAGMA|WITH)\b/iu.test(transformed.sql) ||
        /\bRETURNING\b/iu.test(transformed.sql);
      if (returnsRows) {
        const rows = statement
          .all(...bindings)
          .map((row) => normalizeRow<Row>(row as Record<string, unknown>));
        return { rows, rowCount: rows.length };
      }
      const result: StatementResultingChanges = statement.run(...bindings);
      return { rows: [], rowCount: Number(result.changes) };
    } catch (error) {
      if (error instanceof Error && "code" in error) {
        const message = error.message.toLowerCase();
        if (message.includes("foreign key"))
          Object.assign(error, { code: "23503" });
        else if (message.includes("unique"))
          Object.assign(error, { code: "23505" });
        else if (message.includes("pending deletion"))
          Object.assign(error, { code: "55000" });
        else if (
          message.includes("check constraint") ||
          message.includes("immutable") ||
          message.includes("append-only")
        )
          Object.assign(error, { code: "23514" });
      }
      throw error;
    } finally {
      this.statementTime = undefined;
    }
  }

  public exec(sql: string): void {
    this.client.exec(sql);
  }

  public enableDefensiveMode(): void {
    this.client.enableDefensive(true);
  }

  public authorizeWorkspaceDeletion(): void {
    this.deletionAuthorized = true;
  }

  public async end(): Promise<void> {
    if (this.closed) return;
    const release = await this.mutex.acquire();
    try {
      this.client.close();
      this.closed = true;
    } finally {
      release();
    }
  }
}

export type Pool = SqlitePool;
export type PoolClient = SqliteClient;

export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
