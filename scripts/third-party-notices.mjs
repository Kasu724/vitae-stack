import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { format } from "prettier";

let command = "corepack";
let prefix = ["pnpm"];
if (process.env.npm_execpath) {
  command = process.execPath;
  prefix = [process.env.npm_execpath];
} else if (process.platform === "win32") {
  const corepackCommand = execFileSync("where.exe", ["corepack"], {
    encoding: "utf8",
  })
    .split(/\r?\n/u)
    .find((candidate) => candidate.toLocaleLowerCase("en-US").endsWith(".cmd"));
  if (!corepackCommand) throw new Error("Corepack executable was not found.");
  command = process.execPath;
  prefix = [
    path.join(
      path.dirname(corepackCommand),
      "node_modules/corepack/dist/corepack.js",
    ),
    "pnpm",
  ];
}
const raw = execFileSync(
  command,
  [...prefix, "licenses", "list", "--json", "--no-optional"],
  {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  },
);
const byLicense = JSON.parse(raw);
const packages = [];
for (const [license, entries] of Object.entries(byLicense)) {
  for (const entry of entries) {
    for (const version of entry.versions) {
      packages.push({
        homepage: entry.homepage ?? "",
        license,
        name: entry.name,
        version,
      });
    }
  }
}
packages.sort((left, right) =>
  `${left.name}@${left.version}`.localeCompare(
    `${right.name}@${right.version}`,
    "en",
  ),
);
const unique = packages.filter(
  (entry, index) =>
    index === 0 ||
    `${entry.name}@${entry.version}` !==
      `${packages[index - 1].name}@${packages[index - 1].version}`,
);
const bundledAssets = [
  {
    license: "OFL-1.1",
    name: "Noto Sans Regular font",
    upstream:
      "https://github.com/notofonts/latin-greek-cyrillic/releases/tag/NotoSans-v2.015",
    version: "2.015",
  },
];
const lines = [
  "# Third-party notices",
  "",
  "This generated inventory covers dependency packages resolved by the pinned pnpm lockfile, including build/test packages present in release tools or worker build layers, plus repository-bundled third-party assets. Package names, versions, declared licenses, and upstream project links are informational; the corresponding distributed license files remain authoritative. This is not legal advice.",
  "",
  "Regenerate with `pnpm notices:generate` after a production dependency change and verify with `pnpm notices:check`. Optional native packages are excluded so the generated notice inventory is stable across Windows and Linux runners.",
  "",
  "| Package | Declared license | Upstream |",
  "| ------- | ---------------- | -------- |",
  ...unique.map((entry) => {
    const label = `${entry.name}@${entry.version}`.replaceAll("|", "\\|");
    const license = String(entry.license).replaceAll("|", "\\|");
    const upstream = entry.homepage
      ? `[project](${entry.homepage.replaceAll("(", "%28").replaceAll(")", "%29")})`
      : "Not declared";
    return `| \`${label}\` | ${license} | ${upstream} |`;
  }),
  "",
  "## Repository-bundled assets",
  "",
  "| Asset | Version | Declared license | Upstream |",
  "| ----- | ------- | ---------------- | -------- |",
  ...bundledAssets.map(
    (asset) =>
      `| ${asset.name} | ${asset.version} | ${asset.license} | [source](${asset.upstream}) |`,
  ),
  "",
];
const generated = await format(`${lines.join("\n")}\n`, {
  parser: "markdown",
});
const target = "THIRD_PARTY_NOTICES.md";
if (process.argv.includes("--check")) {
  const current = await readFile(target, "utf8").catch(() => "");
  if (current !== generated) {
    console.error(
      "THIRD_PARTY_NOTICES.md is stale; run pnpm notices:generate.",
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Third-party notices are current for ${unique.length} packages.`,
    );
  }
} else {
  await writeFile(target, generated, "utf8");
  console.log(`Generated notices for ${unique.length} packages.`);
}
