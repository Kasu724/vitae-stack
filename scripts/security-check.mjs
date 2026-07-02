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
  { name: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/u },
  { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/u },
  { name: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/u },
];

const unsafeSourcePatterns = [
  { name: "dynamic code evaluation", pattern: /\b(?:eval|Function)\s*\(/u },
  {
    name: "raw HTML injection",
    pattern: /dangerouslySetInnerHTML|\.innerHTML\s*=/u,
  },
  {
    name: "disabled TLS verification",
    pattern: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/u,
  },
  { name: "shell-enabled subprocess", pattern: /shell\s*:\s*true/u },
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
  const relative = path.relative(root, file).replaceAll("\\", "/");
  if (relative.startsWith(".github/workflows/")) {
    for (const [index, line] of text.split(/\r?\n/u).entries()) {
      const use = line.match(/^\s*-?\s*uses:\s*([^\s#]+)/u)?.[1];
      if (
        use &&
        !use.startsWith("./") &&
        !/^docker:\/\//u.test(use) &&
        !/@[0-9a-f]{40}$/u.test(use)
      ) {
        failures.push(
          `${relative}:${index + 1} uses an action without a full commit SHA`,
        );
      }
    }
  }
  if (relative.startsWith("src/")) {
    for (const rule of unsafeSourcePatterns) {
      if (rule.pattern.test(text))
        failures.push(`${relative} contains possible ${rule.name}`);
    }
  }
}

const dockerfile = await readFile(path.join(root, "Dockerfile"), "utf8");
for (const [index, line] of dockerfile.split(/\r?\n/u).entries()) {
  const image = line.match(/^FROM\s+(\S+)/u)?.[1];
  if (image?.includes(":") && !/@sha256:[0-9a-f]{64}$/u.test(image)) {
    failures.push(
      `Dockerfile:${index + 1} external base image is not digest pinned`,
    );
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Repository secret-pattern check passed.");
}
