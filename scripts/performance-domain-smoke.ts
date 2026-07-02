import type { CanonicalDocument } from "../src/modules/documents/document-schema";
import { analyzeAts } from "../src/modules/ats/domain";
import { orderedTokenCoverage } from "../src/modules/exports/domain";
import { renderExport } from "../src/modules/exports/renderers";
import { parseSourceBuffer } from "../src/modules/ingestion/parsers";

function id(number: number): string {
  return `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
}

function percentile(values: number[], quantile: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * quantile) - 1)]!;
}

const bullets = Array.from({ length: 36 }, (_, index) => ({
  id: id(index + 10),
  type: "bullet" as const,
  text: `Built synthetic TypeScript evidence workflow ${index + 1} with ${20 + index}% measured improvement.`,
}));
const document: CanonicalDocument = {
  schemaVersion: 1,
  kind: "resume",
  sections: [
    {
      id: id(1),
      type: "contact",
      heading: "Contact",
      blocks: [
        {
          id: id(2),
          type: "contact",
          text: "Synthetic Candidate | candidate@example.test",
        },
      ],
    },
    {
      id: id(3),
      type: "summary",
      heading: "Summary",
      blocks: [
        {
          id: id(4),
          type: "paragraph",
          text: "Evidence-focused synthetic product engineer.",
        },
      ],
    },
    {
      id: id(5),
      type: "experience",
      heading: "Experience",
      blocks: bullets,
    },
  ],
};
const requirements = Array.from({ length: 20 }, (_, index) => ({
  id: `requirement-${index}`,
  text: `Build TypeScript evidence workflow ${index + 1}`,
  category: index < 12 ? "required_qualification" : "responsibility",
  priority: index < 12 ? "required" : "preferred",
}));
const claims = bullets.map((block, index) => ({
  id: `claim-${index}`,
  blockId: block.id,
  start: 0,
  end: block.text.length,
  status: "supported" as const,
  evidence: [{ id: `evidence-${index}`, status: "approved" }],
}));
const support = requirements.map((requirement, index) => ({
  requirementId: requirement.id,
  evidenceFactId: `evidence-${index}`,
  strength: "direct" as const,
}));

const atsDurations: number[] = [];
for (let iteration = 0; iteration < 50; iteration += 1) {
  const started = performance.now();
  analyzeAts({ document, requirements, claims, support });
  atsDurations.push(performance.now() - started);
}

const exportDurations: Record<"docx" | "pdf", number[]> = {
  docx: [],
  pdf: [],
};
for (const format of ["pdf", "docx"] as const) {
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const started = performance.now();
    const rendered = await renderExport({
      title: "Synthetic two-page performance resume",
      format,
      document,
      unsupportedClaimIds: [],
    });
    const parsed = await parseSourceBuffer(
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      rendered.bytes,
      500_000,
    );
    if (orderedTokenCoverage(rendered.sourceText, parsed.text) < 0.98) {
      throw new Error(`${format} parse-back coverage fell below 98%.`);
    }
    exportDurations[format].push(performance.now() - started);
  }
}

const result = {
  fixture: {
    bullets: bullets.length,
    claims: claims.length,
    requirements: requirements.length,
  },
  atsP95Milliseconds: Math.round(percentile(atsDurations, 0.95)),
  pdfP95Milliseconds: Math.round(percentile(exportDurations.pdf, 0.95)),
  docxP95Milliseconds: Math.round(percentile(exportDurations.docx, 0.95)),
};
process.stdout.write(`${JSON.stringify(result)}\n`);
if (
  result.atsP95Milliseconds > 2_000 ||
  result.pdfP95Milliseconds > 10_000 ||
  result.docxP95Milliseconds > 10_000
) {
  process.exitCode = 1;
}
