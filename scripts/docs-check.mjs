import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const allTrackedFiles = execFileSync("git", ["ls-files"], {
  cwd: root,
  encoding: "utf8",
})
  .split(/\r?\n/u)
  .filter(Boolean);

const trackedFiles = execFileSync("git", ["ls-files", "*.md"], {
  cwd: root,
  encoding: "utf8",
})
  .split(/\r?\n/u)
  .filter(Boolean);

const tracked = new Set(
  allTrackedFiles.map((file) => file.replaceAll("\\", "/")),
);
const failures = [];
const markerPattern = /\b(?:TODO|TBD|FIXME|XXX|lorem ipsum)\b/iu;
const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/gu;

for (const file of trackedFiles) {
  const absoluteFile = path.join(root, file);
  const content = await readFile(absoluteFile, "utf8");
  if (content.trim().length === 0) failures.push(`${file} is empty`);
  if (markerPattern.test(content))
    failures.push(`${file} contains a stale marker`);
  if ((content.match(/^```/gmu)?.length ?? 0) % 2 !== 0)
    failures.push(`${file} has an unmatched fence`);

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
      failures.push(`${file} links to untracked file ${target}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Documentation check passed for ${trackedFiles.length} tracked Markdown files.`,
  );
}
