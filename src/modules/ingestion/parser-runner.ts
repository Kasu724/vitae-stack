import { spawn } from "node:child_process";
import path from "node:path";

import { z } from "zod";

import type { SupportedMediaType } from "./file-validation";
import type { ParsedSource } from "./parsers";

const childResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    result: z.object({
      text: z.string(),
      metadata: z.object({
        schemaVersion: z.literal(1),
        pageCount: z.number().int().positive().optional(),
        paragraphCount: z.number().int().nonnegative().optional(),
      }),
      warnings: z.array(z.string()),
      parserVersion: z.string(),
    }),
  }),
  z.object({ ok: z.literal(false), errorCode: z.string().max(100) }),
]);

export type ParserProcessResult =
  { ok: true; result: ParsedSource } | { ok: false; errorCode: string };

export async function runParserChild(input: {
  filePath: string;
  mediaType: SupportedMediaType;
  maximumTextCharacters: number;
  timeoutMs: number;
}): Promise<ParserProcessResult> {
  const tsxCli = path.resolve("node_modules/tsx/dist/cli.mjs");
  const childScript = path.resolve("scripts/parser-child.ts");
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        "--max-old-space-size=192",
        tsxCli,
        childScript,
        input.filePath,
        input.mediaType,
        String(input.maximumTextCharacters),
      ],
      {
        cwd: process.cwd(),
        env: {
          NODE_ENV: process.env.NODE_ENV ?? "production",
          PATH: process.env.PATH ?? "",
        },
        stdio: ["ignore", "pipe", "ignore"] as const,
        windowsHide: true,
      },
    );
    const chunks: Buffer[] = [];
    let byteCount = 0;
    let settled = false;
    const finish = (result: ParserProcessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      byteCount += chunk.length;
      if (byteCount > input.maximumTextCharacters * 4 + 100_000) {
        child.kill("SIGKILL");
        finish({ ok: false, errorCode: "PARSER_OUTPUT_LIMIT" });
      } else chunks.push(chunk);
    });
    child.on("error", () =>
      finish({ ok: false, errorCode: "PARSER_START_FAILED" }),
    );
    child.on("close", () => {
      try {
        finish(
          childResultSchema.parse(
            JSON.parse(Buffer.concat(chunks).toString("utf8")),
          ) as ParserProcessResult,
        );
      } catch {
        finish({ ok: false, errorCode: "PARSER_INVALID_RESULT" });
      }
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, errorCode: "PARSER_TIMEOUT" });
    }, input.timeoutMs);
    timer.unref();
  });
}
