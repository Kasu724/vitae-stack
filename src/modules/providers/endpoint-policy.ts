import { isIP } from "node:net";

import { isPublicAddress } from "../job-fetch/network-policy";

export class UnsafeProviderEndpointError extends Error {
  public constructor(public readonly code: string) {
    super("The model provider endpoint is not allowed by network policy.");
    this.name = "UnsafeProviderEndpointError";
  }
}

function parseOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new UnsafeProviderEndpointError("INVALID_ALLOWLIST_ORIGIN");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new UnsafeProviderEndpointError("INVALID_ALLOWLIST_ORIGIN");
  return url.origin;
}

export function parseProviderPrivateOriginAllowlist(
  raw: string | undefined,
): ReadonlySet<string> {
  if (!raw?.trim()) return new Set();
  const origins = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(parseOrigin);
  if (origins.length > 20)
    throw new UnsafeProviderEndpointError("ALLOWLIST_TOO_LARGE");
  return new Set(origins);
}

export interface ValidatedProviderEndpoint {
  baseUrl: URL;
  privateOriginAllowed: boolean;
}

export function validateProviderBaseUrl(
  raw: string,
  privateOrigins: ReadonlySet<string>,
): ValidatedProviderEndpoint {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeProviderEndpointError("INVALID_URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new UnsafeProviderEndpointError("PROTOCOL_NOT_ALLOWED");
  if (url.username || url.password)
    throw new UnsafeProviderEndpointError("CREDENTIALS_NOT_ALLOWED");
  if (url.search || url.hash)
    throw new UnsafeProviderEndpointError("QUERY_OR_HASH_NOT_ALLOWED");
  const privateOriginAllowed = privateOrigins.has(url.origin);
  if (!privateOriginAllowed) {
    if (url.protocol !== "https:")
      throw new UnsafeProviderEndpointError("PUBLIC_HTTPS_REQUIRED");
    if (url.port && url.port !== "443")
      throw new UnsafeProviderEndpointError("PUBLIC_PORT_NOT_ALLOWED");
    const hostname = url.hostname.replace(/^\[|\]$/gu, "");
    if (!hostname || isIP(hostname))
      throw new UnsafeProviderEndpointError("PUBLIC_IP_LITERAL_NOT_ALLOWED");
    if (hostname === "localhost" || hostname.endsWith(".localhost"))
      throw new UnsafeProviderEndpointError("PUBLIC_HOST_NOT_ALLOWED");
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return { baseUrl: url, privateOriginAllowed };
}

export function requirePublicAddresses(
  addresses: ReadonlyArray<{ address: string }>,
): void {
  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicAddress(address))
  )
    throw new UnsafeProviderEndpointError("NONPUBLIC_ADDRESS");
}
