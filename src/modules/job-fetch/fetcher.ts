import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

import { extractJobTextFromHtml } from "./html-text";
import {
  isPublicAddress,
  UnsafeJobUrlError,
  validatePublicJobUrl,
} from "./network-policy";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;

export interface FetchedJobDescription {
  requestedUrl: string;
  finalUrl: string;
  finalOrigin: string;
  retrievedAt: string;
  contentType: "text/html" | "text/plain";
  text: string;
  contentHash: string;
  redirectCount: number;
}

export interface JobFetchDependencies {
  resolve?: typeof lookup;
  request?: typeof httpsRequest;
  timeoutMs?: number;
}

function decodeBody(body: Buffer, encoding: string | undefined): Buffer {
  const options = { maxOutputLength: MAX_BYTES };
  try {
    let decoded: Buffer;
    if (!encoding || encoding === "identity") return body;
    if (encoding === "gzip") decoded = gunzipSync(body, options);
    else if (encoding === "deflate") decoded = inflateSync(body, options);
    else if (encoding === "br") decoded = brotliDecompressSync(body, options);
    else throw new UnsafeJobUrlError("UNSUPPORTED_ENCODING");
    if (decoded.length > 1024 * 1024 && decoded.length > body.length * 100)
      throw new UnsafeJobUrlError("COMPRESSION_RATIO_EXCEEDED");
    return decoded;
  } catch (error) {
    if (error instanceof UnsafeJobUrlError) throw error;
    throw new UnsafeJobUrlError("INVALID_COMPRESSION");
  }
}

async function beforeDeadline<T>(
  work: Promise<T>,
  deadline: number,
): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new UnsafeJobUrlError("FETCH_TIMEOUT");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new UnsafeJobUrlError("FETCH_TIMEOUT")),
          remaining,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchOnce(
  url: URL,
  deadline: number,
  resolve: typeof lookup,
  requestImpl: typeof httpsRequest,
): Promise<{
  status: number;
  location?: string;
  body?: Buffer;
  contentType?: "text/html" | "text/plain";
}> {
  const addresses = await beforeDeadline(
    resolve(url.hostname, { all: true, order: "verbatim" }),
    deadline,
  );
  if (
    !addresses.length ||
    addresses.some((item) => !isPublicAddress(item.address))
  )
    throw new UnsafeJobUrlError("NONPUBLIC_ADDRESS");
  const pinned = addresses[0]!;
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new UnsafeJobUrlError("FETCH_TIMEOUT");
  const pinnedLookup: LookupFunction = (_hostname, _options, callback) => {
    callback(null, pinned.address, pinned.family);
  };

  return new Promise((resolveRequest, rejectRequest) => {
    let settled = false;
    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    const clearTimers = () => {
      if (connectTimer) clearTimeout(connectTimer);
      clearTimeout(absoluteTimer);
    };
    const succeed = (value: {
      status: number;
      location?: string;
      body?: Buffer;
      contentType?: "text/html" | "text/plain";
    }) => {
      if (settled) return;
      settled = true;
      clearTimers();
      resolveRequest(value);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimers();
      rejectRequest(
        error instanceof UnsafeJobUrlError
          ? error
          : new UnsafeJobUrlError("FETCH_FAILED"),
      );
    };
    const req = requestImpl(
      {
        protocol: "https:",
        hostname: url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: url.hostname,
        lookup: pinnedLookup,
        maxHeaderSize: 32 * 1024,
        headers: {
          accept: "text/html,text/plain;q=0.9",
          "accept-encoding": "br,gzip,deflate",
          "user-agent": "Vitae-Stack-Job-Fetcher/1.0",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = response.headers.location;
          response.resume();
          if (!location) {
            fail(new UnsafeJobUrlError("INVALID_REDIRECT"));
            return;
          }
          succeed({ status, location });
          return;
        }
        if (status < 200 || status >= 300) {
          response.resume();
          fail(new UnsafeJobUrlError("UPSTREAM_STATUS"));
          return;
        }
        const rawType = response.headers["content-type"]
          ?.split(";", 1)[0]
          ?.trim()
          .toLowerCase();
        const contentType =
          rawType === "text/html"
            ? "text/html"
            : rawType === "text/plain"
              ? "text/plain"
              : null;
        if (!contentType) {
          response.resume();
          fail(new UnsafeJobUrlError("UNSUPPORTED_CONTENT_TYPE"));
          return;
        }
        const declaredLength = Number(response.headers["content-length"]);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
          response.destroy();
          fail(new UnsafeJobUrlError("RESPONSE_TOO_LARGE"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            const error = new UnsafeJobUrlError("RESPONSE_TOO_LARGE");
            fail(error);
            response.destroy(error);
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", fail);
        response.on("end", () => {
          try {
            const body = decodeBody(
              Buffer.concat(chunks),
              typeof response.headers["content-encoding"] === "string"
                ? response.headers["content-encoding"].trim().toLowerCase()
                : undefined,
            );
            if (body.length > MAX_BYTES)
              throw new UnsafeJobUrlError("RESPONSE_TOO_LARGE");
            succeed({ status, body, contentType });
          } catch (error) {
            fail(error);
          }
        });
      },
    );
    req.maxHeadersCount = 100;
    connectTimer = setTimeout(
      () => {
        const error = new UnsafeJobUrlError("CONNECT_TIMEOUT");
        fail(error);
        req.destroy(error);
      },
      Math.min(3000, remaining),
    );
    req.once("response", () => {
      if (connectTimer) clearTimeout(connectTimer);
      connectTimer = undefined;
    });
    const timeOut = () => {
      const error = new UnsafeJobUrlError("FETCH_TIMEOUT");
      fail(error);
      req.destroy(error);
    };
    const absoluteTimer = setTimeout(timeOut, remaining);
    req.setTimeout(remaining, timeOut);
    req.on("error", fail);
    req.end();
  });
}

export async function fetchPublicJobDescription(
  rawUrl: string,
  dependencies: JobFetchDependencies = {},
): Promise<FetchedJobDescription> {
  const requested = validatePublicJobUrl(rawUrl);
  const resolve = dependencies.resolve ?? lookup;
  const requestImpl = dependencies.request ?? httpsRequest;
  const deadline = Date.now() + (dependencies.timeoutMs ?? TIMEOUT_MS);
  let current = requested;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetchOnce(current, deadline, resolve, requestImpl);
    if (response.location) {
      if (redirects === MAX_REDIRECTS)
        throw new UnsafeJobUrlError("TOO_MANY_REDIRECTS");
      current = validatePublicJobUrl(new URL(response.location, current).href);
      continue;
    }
    const body = response.body!;
    const contentType = response.contentType!;
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(body);
    const text =
      contentType === "text/html" ? extractJobTextFromHtml(decoded) : decoded;
    if (!text.trim()) throw new UnsafeJobUrlError("EMPTY_CONTENT");
    if (text.length > 500_000)
      throw new UnsafeJobUrlError("EXTRACTED_TEXT_TOO_LARGE");
    return {
      requestedUrl: requested.href,
      finalUrl: current.href,
      finalOrigin: current.origin,
      retrievedAt: new Date().toISOString(),
      contentType,
      text,
      contentHash: `sha256:${createHash("sha256").update(body).digest("hex")}`,
      redirectCount: redirects,
    };
  }
  throw new UnsafeJobUrlError("TOO_MANY_REDIRECTS");
}
