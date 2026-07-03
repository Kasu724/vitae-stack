import {
  Document as DocxDocument,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

import type { CanonicalDocument } from "@/modules/documents/document-schema";

import {
  EXPORT_MAX_BYTES,
  EXPORT_TEMPLATE_ID,
  ExportValidationError,
  exportSourceText,
  type ExportFormat,
  type RenderedExport,
  sanitizeExportDocument,
  UnsupportedExportClaimsError,
} from "./domain";

const DRAFT_BANNER =
  "DRAFT — unsupported factual claims require review. Not for final submission.";
const PDF_FONT_NAME = "NotoSans";
const pdfFontBytes = readFileSync(
  path.join(process.cwd(), "assets", "fonts", "NotoSans-Regular.ttf"),
);

const rendererVersions: Record<ExportFormat, string> = {
  pdf: "pdfkit@0.19.1+template@2+noto-sans@2.015",
  docx: "docx@9.7.1+template@2",
  markdown: "builtin-markdown@1",
  text: "builtin-text@1",
  json: "builtin-json@1",
};

function classification(
  format: ExportFormat,
  unsupportedClaimIds: string[],
): "final" | "draft" {
  if (!unsupportedClaimIds.length) return "final";
  if (format === "pdf" || format === "docx")
    throw new UnsupportedExportClaimsError(unsupportedClaimIds);
  return "draft";
}

function escapeMarkdown(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/([\\`*_{}\[\]()#+.!|~-])/gu, "\\$1");
}

function renderMarkdown(document: CanonicalDocument, draft: boolean): Buffer {
  const lines: string[] = [];
  if (draft) lines.push(`> **${DRAFT_BANNER}**`, "");
  for (const section of document.sections) {
    if (section.heading)
      lines.push(`## ${escapeMarkdown(section.heading)}`, "");
    for (const block of section.blocks) {
      const text = escapeMarkdown(block.text);
      lines.push(block.type === "bullet" ? `- ${text}` : text, "");
    }
  }
  return Buffer.from(`${lines.join("\n").trimEnd()}\n`, "utf8");
}

function renderText(document: CanonicalDocument, draft: boolean): Buffer {
  const lines: string[] = [];
  if (draft) lines.push(DRAFT_BANNER, "");
  for (const section of document.sections) {
    if (section.heading) lines.push(section.heading.toLocaleUpperCase("en-US"));
    for (const block of section.blocks)
      lines.push(block.type === "bullet" ? `• ${block.text}` : block.text);
    lines.push("");
  }
  return Buffer.from(`${lines.join("\n").trimEnd()}\n`, "utf8");
}

function textRuns(value: string): TextRun[] {
  return value.split("\n").map(
    (line, index) =>
      new TextRun({
        text: line || " ",
        ...(index ? { break: 1 } : {}),
      }),
  );
}

async function renderDocx(
  title: string,
  document: CanonicalDocument,
): Promise<Buffer> {
  const children: Paragraph[] = [];
  for (const section of document.sections) {
    if (section.heading)
      children.push(
        new Paragraph({
          text: section.heading,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 80 },
        }),
      );
    for (const block of section.blocks)
      children.push(
        new Paragraph({
          children: textRuns(block.text),
          ...(block.type === "bullet" ? { bullet: { level: 0 } } : {}),
          spacing: { after: 80, line: 240 },
        }),
      );
  }
  const file = new DocxDocument({
    title,
    subject: "Career document export",
    creator: "Vitae Stack",
    description: "Evidence-grounded career document",
    styles: {
      default: {
        document: {
          run: {
            font: "Arial",
            size: 22,
            language: { value: "en-US" },
          },
          paragraph: { spacing: { line: 240 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(file);
}

function renderPdf(
  title: string,
  document: CanonicalDocument,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const pdfOptions = {
      autoFirstPage: true,
      bufferPages: false,
      compress: true,
      displayTitle: true,
      info: {
        Title: title,
        Author: "Vitae Stack",
        Subject: "Evidence-grounded career document",
        CreationDate: new Date(0),
        ModDate: new Date(0),
      },
      lang: "en-US",
      margins: { top: 48, right: 48, bottom: 48, left: 48 },
      pdfVersion: "1.7",
      size: "LETTER",
    } as unknown as PDFKit.PDFDocumentOptions;
    const pdf = new PDFDocument(pdfOptions);
    pdf.registerFont(PDF_FONT_NAME, pdfFontBytes);
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("error", reject);
    pdf.on("end", () => resolve(Buffer.concat(chunks)));

    for (const section of document.sections) {
      if (section.heading) {
        pdf
          .font(PDF_FONT_NAME)
          .fontSize(13)
          .text(`${section.heading} `, { paragraphGap: 4 });
      }
      let bulletGroup: string[] = [];
      const flushBullets = () => {
        if (!bulletGroup.length) return;
        pdf
          .font(PDF_FONT_NAME)
          .fontSize(10)
          .list(
            bulletGroup.map((value) => `${value} `),
            {
              bulletIndent: 10,
              textIndent: 20,
            },
          );
        bulletGroup = [];
      };
      for (const block of section.blocks) {
        if (block.type === "bullet") {
          bulletGroup.push(block.text || " ");
          continue;
        }
        flushBullets();
        pdf
          .font(PDF_FONT_NAME)
          .fontSize(block.type === "heading" ? 11 : 10)
          .text(`${block.text || " "} `, { paragraphGap: 3 });
      }
      flushBullets();
    }
    pdf.end();
  });
}

export async function renderExport(input: {
  title: string;
  format: ExportFormat;
  document: CanonicalDocument;
  unsupportedClaimIds: string[];
}): Promise<RenderedExport> {
  const state = classification(input.format, input.unsupportedClaimIds);
  const sanitized = sanitizeExportDocument(input.document);
  const sourceText = exportSourceText(sanitized.document);
  let bytes: Buffer;
  let mediaType: string;
  let extension: string;
  if (input.format === "pdf") {
    bytes = await renderPdf(input.title, sanitized.document);
    mediaType = "application/pdf";
    extension = "pdf";
  } else if (input.format === "docx") {
    bytes = await renderDocx(input.title, sanitized.document);
    mediaType =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    extension = "docx";
  } else if (input.format === "markdown") {
    bytes = renderMarkdown(sanitized.document, state === "draft");
    mediaType = "text/markdown; charset=utf-8";
    extension = "md";
  } else if (input.format === "text") {
    bytes = renderText(sanitized.document, state === "draft");
    mediaType = "text/plain; charset=utf-8";
    extension = "txt";
  } else {
    bytes = Buffer.from(
      `${JSON.stringify(
        {
          schemaVersion: 1,
          classification: state,
          warning: state === "draft" ? DRAFT_BANNER : null,
          unsupportedClaimIds: input.unsupportedClaimIds,
          templateId: EXPORT_TEMPLATE_ID,
          document: sanitized.document,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    mediaType = "application/json";
    extension = "json";
  }
  if (!bytes.length || bytes.length > EXPORT_MAX_BYTES)
    throw new ExportValidationError("Export output exceeded safe bounds.");
  return {
    bytes,
    format: input.format,
    classification: state,
    mediaType,
    extension,
    rendererVersion: rendererVersions[input.format],
    warnings: sanitized.warnings,
    sourceText,
  };
}
