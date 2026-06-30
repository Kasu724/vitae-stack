import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";

import type { ProviderHttpResponse, ProviderHttpTransport } from "./contracts";
import { ProviderRequestError } from "./contracts";
import {
  requirePublicAddresses,
  type ValidatedProviderEndpoint,
} from "./endpoint-policy";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;

export interface NodeProviderTransportDependencies {
  resolve?: typeof lookup;
}

async function beforeDeadline<T>(
  work: Promise<T>,
  deadline: number,
): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new ProviderRequestError("TIMEOUT");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new ProviderRequestError("TIMEOUT")),
          remaining,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class NodeProviderHttpTransport implements ProviderHttpTransport {
  public constructor(
    private readonly endpoint: ValidatedProviderEndpoint,
    private readonly dependencies: NodeProviderTransportDependencies = {},
  ) {}

  public async postJson(input: {
    url: URL;
    headers: Record<string, string>;
    body: unknown;
    timeoutMs: number;
  }): Promise<ProviderHttpResponse> {
    if (input.url.origin !== this.endpoint.baseUrl.origin)
      throw new ProviderRequestError("UNAVAILABLE");
    const deadline = Date.now() + input.timeoutMs;
    const resolve = this.dependencies.resolve ?? lookup;
    let addresses: LookupAddress[];
    try {
      addresses = await beforeDeadline(
        resolve(input.url.hostname, {
          all: true,
          order: "verbatim",
        }) as Promise<LookupAddress[]>,
        deadline,
      );
      if (!this.endpoint.privateOriginAllowed)
        requirePublicAddresses(addresses);
    } catch (error) {
      if (error instanceof ProviderRequestError) throw error;
      throw new ProviderRequestError("UNAVAILABLE");
    }
    const pinned = addresses[0];
    if (!pinned) throw new ProviderRequestError("UNAVAILABLE");
    const encoded = Buffer.from(JSON.stringify(input.body), "utf8");
    if (encoded.length > MAX_REQUEST_BYTES)
      throw new ProviderRequestError("INVALID_RESPONSE");
    const pinnedLookup: LookupFunction = (_hostname, _options, callback) =>
      callback(null, pinned.address, pinned.family);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ProviderRequestError("TIMEOUT");
    const requestImpl =
      input.url.protocol === "https:" ? httpsRequest : httpRequest;

    return new Promise((resolveRequest, reject) => {
      const req = requestImpl(
        {
          protocol: input.url.protocol,
          hostname: input.url.hostname,
          port: input.url.port || undefined,
          path: `${input.url.pathname}${input.url.search}`,
          method: "POST",
          servername:
            input.url.protocol === "https:" ? input.url.hostname : undefined,
          lookup: pinnedLookup,
          maxHeaderSize: 32 * 1024,
          headers: {
            accept: "application/json",
            ...input.headers,
            "content-length": String(encoded.length),
            "user-agent": "Vitae-Stack-AI-Provider/1.0",
          },
        },
        (response) => {
          const rawType = response.headers["content-type"]
            ?.split(";", 1)[0]
            ?.trim()
            .toLowerCase();
          const declaredLength = Number(response.headers["content-length"]);
          if (
            rawType !== "application/json" ||
            (Number.isFinite(declaredLength) &&
              declaredLength > MAX_RESPONSE_BYTES)
          ) {
            response.destroy();
            reject(new ProviderRequestError("INVALID_RESPONSE"));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_RESPONSE_BYTES) {
              response.destroy(new ProviderRequestError("INVALID_RESPONSE"));
              return;
            }
            chunks.push(chunk);
          });
          response.on("error", reject);
          response.on("end", () => {
            try {
              const body = JSON.parse(
                Buffer.concat(chunks).toString("utf8"),
              ) as unknown;
              resolveRequest({
                status: response.statusCode ?? 0,
                headers: {
                  "retry-after": Array.isArray(response.headers["retry-after"])
                    ? response.headers["retry-after"][0]
                    : response.headers["retry-after"],
                },
                body,
              });
            } catch {
              reject(new ProviderRequestError("INVALID_RESPONSE"));
            }
          });
        },
      );
      req.maxHeadersCount = 100;
      req.setTimeout(remaining, () =>
        req.destroy(new ProviderRequestError("TIMEOUT")),
      );
      req.on("error", (error) =>
        reject(
          error instanceof ProviderRequestError
            ? error
            : new ProviderRequestError("UNAVAILABLE"),
        ),
      );
      req.end(encoded);
    });
  }
}
