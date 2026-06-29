import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignored = new Set([
  ".git",
  ".next",
  "node_modules",
  "coverage",
  "playwright-report",
  "test-results",
  "LICENSE",
]);
const suspicious = [
  {
    name: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  },
  { name: "OpenAI-style key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/u },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/u },
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else files.push(target);
  }
  return files;
}

const failures = [];
for (const file of await walk(root)) {
  const content = await readFile(file).catch(() => undefined);
  if (!content || content.includes(0)) continue;
  const text = content.toString("utf8");
  for (const rule of suspicious) {
    if (rule.pattern.test(text))
      failures.push(
        `${path.relative(root, file)} contains a possible ${rule.name}`,
      );
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Repository secret-pattern check passed.");
}
