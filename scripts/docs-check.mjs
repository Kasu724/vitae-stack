import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const repositoryFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  {
    cwd: root,
    encoding: "utf8",
  },
)
  .split(/\r?\n/u)
  .filter(Boolean);

const markdownFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.md"],
  {
    cwd: root,
    encoding: "utf8",
  },
)
  .split(/\r?\n/u)
  .filter(Boolean);

const included = new Set(
  repositoryFiles.map((file) => file.replaceAll("\\", "/")),
);
const failures = [];
for (const required of [
  "ARCHITECTURE.md",
  "docs/README.md",
  "docs/product/PRODUCT_REQUIREMENTS.md",
  "docs/product/ACCEPTANCE_CRITERIA.md",
  "docs/architecture/SYSTEM_CONTEXT.md",
  "docs/security/THREAT_MODEL.md",
  "docs/exec-plans/REQUIREMENTS_TRACEABILITY.md",
  "docs/exec-plans/active/MVP_IMPLEMENTATION.md",
])
  if (!included.has(required))
    failures.push(`${required} is ignored or excluded from repository checks`);

const tracked = new Set(
  repositoryFiles.map((file) => file.replaceAll("\\", "/")),
);
const markerPattern = /\b(?:TODO|TBD|FIXME|XXX|lorem ipsum)\b/iu;
const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/gu;
const currentStateDocPattern =
  /^(?:ARCHITECTURE\.md|docs\/(?:architecture|design|engineering|operations|product|security)\/|docs\/exec-plans\/active\/)/u;
const migrationReferencePattern = /\bmigrations?\s+(00\d{2})\b/giu;

for (const file of markdownFiles) {
  const absoluteFile = path.join(root, file);
  const content = await readFile(absoluteFile, "utf8");
  if (content.trim().length === 0) failures.push(`${file} is empty`);
  if (markerPattern.test(content))
    failures.push(`${file} contains a stale marker`);
  if ((content.match(/^```/gmu)?.length ?? 0) % 2 !== 0)
    failures.push(`${file} has an unmatched fence`);
  if (currentStateDocPattern.test(file))
    for (const match of content.matchAll(migrationReferencePattern))
      if (match[1] !== "0001" && match[1] !== "0002")
        failures.push(`${file} references superseded migration ${match[1]}`);

  for (const match of content.matchAll(linkPattern)) {
    const target = match[1]?.trim().replace(/^<|>$/gu, "");
    if (!target || /^(?:https?:|mailto:|#)/u.test(target)) continue;
    const [relativeTarget] = target.split("#", 1);
    if (!relativeTarget) continue;

    const resolved = path.resolve(
      path.dirname(absoluteFile),
      decodeURIComponent(relativeTarget),
    );
    if (!resolved.startsWith(root + path.sep)) {
      failures.push(`${file} links outside repository: ${target}`);
      continue;
    }

    try {
      const info = await stat(resolved);
      if (info.isDirectory()) {
        failures.push(`${file} links to directory, not file: ${target}`);
        continue;
      }
    } catch {
      failures.push(`${file} has broken link ${target}`);
      continue;
    }

    const repoRelative = path.relative(root, resolved).replaceAll("\\", "/");
    if (!tracked.has(repoRelative)) {
      failures.push(`${file} links to an ignored or excluded file ${target}`);
    }
  }
}

const requirements = await readFile(
  path.join(root, "docs/product/PRODUCT_REQUIREMENTS.md"),
  "utf8",
);
const criteria = await readFile(
  path.join(root, "docs/product/ACCEPTANCE_CRITERIA.md"),
  "utf8",
);
const traceability = await readFile(
  path.join(root, "docs/exec-plans/REQUIREMENTS_TRACEABILITY.md"),
  "utf8",
);
const expectedIds = [
  ...new Set(requirements.match(/\bPR-\d{3}\b/gu) ?? []),
  ...new Set(criteria.match(/\bAC-\d{3}\b/gu) ?? []),
];
for (const id of expectedIds) {
  const row = traceability.match(
    new RegExp(
      `^\\|\\s*${id}\\s*\\|\\s*([^|]+?)\\s*\\|\\s*([^|]+?)\\s*\\|$`,
      "mu",
    ),
  );
  if (!row)
    failures.push(`Traceability is missing a complete table row for ${id}`);
  else if (!/\bM\d{2}\b/u.test(row[1] ?? ""))
    failures.push(`Traceability row ${id} has no milestone`);
}

const activePlan = await readFile(
  path.join(root, "docs/exec-plans/active/MVP_IMPLEMENTATION.md"),
  "utf8",
);
const riskRegister = await readFile(
  path.join(root, "docs/exec-plans/RISK_REGISTER.md"),
  "utf8",
);
if (/\bMigrations? 00(?:0[4-9]|1[0-8])\b/u.test(activePlan))
  failures.push(
    "Active plan references superseded per-feature migration numbers",
  );
if (/\bT\d{2}\b/u.test(`${activePlan}\n${riskRegister}`))
  failures.push("Current execution docs reference undefined TNN threat IDs");

const qualityGates = await readFile(
  path.join(root, "docs/engineering/QUALITY_GATES.md"),
  "utf8",
);
for (const command of ["pnpm test:evals --smoke", "pnpm db:check"])
  if (!qualityGates.includes(command))
    failures.push(`Quality gates omit ${command}`);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Documentation check passed for ${markdownFiles.length} repository Markdown files.`,
  );
}
