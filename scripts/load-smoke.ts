import { readFile } from "node:fs/promises";

export {};

const baseUrl = process.env.LOAD_BASE_URL;
const cookieFile = process.env.LOAD_AUTH_COOKIE_FILE;
if (!baseUrl || !cookieFile) {
  process.stderr.write(
    "LOAD_BASE_URL and LOAD_AUTH_COOKIE_FILE are required for an isolated authenticated deployment.\n",
  );
  process.exitCode = 2;
} else {
  const target = new URL(process.env.LOAD_PATH ?? "/dashboard", baseUrl);
  const cookie = (await readFile(cookieFile, "utf8")).trim();
  if (!/^[^=;\s]+=[^;\r\n]+(?:;\s*[^=;\s]+=[^;\r\n]+)*$/u.test(cookie)) {
    throw new Error(
      "LOAD_AUTH_COOKIE_FILE must contain only one Cookie request-header value.",
    );
  }
  const requestCount = 200;
  const concurrency = 20;
  const durations: number[] = [];
  let failures = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const index = next++;
        if (index >= requestCount) return;
        const started = performance.now();
        try {
          const response = await fetch(target, {
            headers: { cookie },
            redirect: "error",
            signal: AbortSignal.timeout(2_000),
          });
          if (!response.ok) failures += 1;
          await response.arrayBuffer();
        } catch {
          failures += 1;
        }
        durations.push(performance.now() - started);
      }
    }),
  );
  durations.sort((left, right) => left - right);
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? Infinity;
  process.stdout.write(
    `${JSON.stringify({ target: `${target.origin}${target.pathname}`, requestCount, concurrency, failures, p95Milliseconds: Math.round(p95) })}\n`,
  );
  if (failures > 0 || p95 > 500) process.exitCode = 1;
}
