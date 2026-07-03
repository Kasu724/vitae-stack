import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const folder = path.resolve("db/migrations");
const files = (await readdir(folder))
  .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/iu.test(file))
  .sort();
if (files.length === 0) throw new Error("No SQLite migrations were found.");

const database = new DatabaseSync(":memory:", { timeout: 5_000 });
database.function("regexp", (pattern, value) =>
  typeof value === "string" && new RegExp(String(pattern), "u").test(value)
    ? 1
    : 0,
);
database.function("now", () => new Date().toISOString());
database.function("date_add", (value, milliseconds) =>
  new Date(
    new Date(String(value)).getTime() + Number(milliseconds),
  ).toISOString(),
);
database.function("workspace_deletion_authorized", () => 0);

for (const file of files)
  database.exec(await readFile(path.join(folder, file), "utf8"));

const tables = database
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )
  .all();
const triggers = database
  .prepare("SELECT count(*) count FROM sqlite_master WHERE type='trigger'")
  .get();
const integrity = database.prepare("PRAGMA integrity_check").get();
const foreignKeys = database.prepare("PRAGMA foreign_key_check").all();
database.close();

if (tables.length !== 46)
  throw new Error(`Expected 46 application tables, found ${tables.length}.`);
if (Number(triggers.count) < 100)
  throw new Error(`Expected lifecycle triggers, found ${triggers.count}.`);
if (integrity.integrity_check !== "ok")
  throw new Error(
    `SQLite integrity check failed: ${integrity.integrity_check}`,
  );
if (foreignKeys.length !== 0)
  throw new Error("SQLite foreign-key validation failed.");

process.stdout.write(
  `SQLite schema check passed for ${files.length} migration(s), ${tables.length} tables, and ${triggers.count} triggers.\n`,
);
