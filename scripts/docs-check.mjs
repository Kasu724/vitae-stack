import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignored = new Set([
  ".git",
  ".next",
  "node_modules",
  "coverage",
  "playwright-report",
  "test-results",
]);

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

const markdownFiles = (await walk(root)).filter((file) => file.endsWith(".md"));
const failures = [];
const markerPattern = /\b(?:TODO|TBD|FIXME|XXX|lorem ipsum)\b/iu;
const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/gu;

for (const file of markdownFiles) {
  const content = await readFile(file, "utf8");
  if (content.trim().length === 0)
    failures.push(`${path.relative(root, file)} is empty`);
  if (
    markerPattern.test(content) &&
    !file.endsWith(path.join("docs", "exec-plans", "TECH_DEBT.md"))
  ) {
    failures.push(`${path.relative(root, file)} contains a stale marker`);
  }
  if ((content.match(/^```/gmu)?.length ?? 0) % 2 !== 0)
    failures.push(`${path.relative(root, file)} has an unmatched fence`);

  for (const match of content.matchAll(linkPattern)) {
    const target = match[1]?.trim().replace(/^<|>$/gu, "");
    if (!target || /^(?:https?:|mailto:|#)/u.test(target)) continue;
    const [relativeTarget] = target.split("#", 1);
    if (!relativeTarget) continue;
    const resolved = path.resolve(
      path.dirname(file),
      decodeURIComponent(relativeTarget),
    );
    try {
      await stat(resolved);
    } catch {
      failures.push(`${path.relative(root, file)} has broken link ${target}`);
    }
  }
}

const requirements = await readFile(
  path.join(root, "docs/product/PRODUCT_REQUIREMENTS.md"),
  "utf8",
);
const acceptance = await readFile(
  path.join(root, "docs/product/ACCEPTANCE_CRITERIA.md"),
  "utf8",
);
const plan = await readFile(
  path.join(root, "docs/exec-plans/active/MVP_IMPLEMENTATION.md"),
  "utf8",
);
const traceability = await readFile(
  path.join(root, "docs/exec-plans/REQUIREMENTS_TRACEABILITY.md"),
  "utf8",
);

for (let number = 1; number <= 30; number += 1) {
  const id = `PR-${String(number).padStart(3, "0")}`;
  if (!requirements.includes(id)) failures.push(`requirements missing ${id}`);
  if (!traceability.includes(id)) failures.push(`traceability missing ${id}`);
}
for (let number = 1; number <= 28; number += 1) {
  const id = `AC-${String(number).padStart(3, "0")}`;
  if (!acceptance.includes(id))
    failures.push(`acceptance criteria missing ${id}`);
}
for (let number = 1; number <= 22; number += 1) {
  const id = `## M${String(number).padStart(2, "0")}`;
  if (!plan.includes(id))
    failures.push(`execution plan missing ${id.slice(3)}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Documentation check passed for ${markdownFiles.length} Markdown files.`,
  );
}
