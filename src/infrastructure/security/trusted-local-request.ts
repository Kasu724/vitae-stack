const loopbackHostnames = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function hostnameFromAuthority(authority: string | null): string | null {
  if (!authority) return null;
  try {
    return new URL(`http://${authority}`).hostname;
  } catch {
    return null;
  }
}

export function isTrustedLocalRequest(
  headers: Headers,
  requestUrl?: URL,
  allowContainerBind = false,
): boolean {
  if (headers.has("forwarded")) return false;
  const isAllowed = (hostname: string | null) =>
    hostname !== null &&
    (loopbackHostnames.has(hostname) ||
      (hostname === "0.0.0.0" && allowContainerBind));
  const forwardedHostname = hostnameFromAuthority(
    headers.get("x-forwarded-host"),
  );
  if (headers.has("x-forwarded-host") && !isAllowed(forwardedHostname)) {
    return false;
  }
  const hostname =
    hostnameFromAuthority(headers.get("host")) ?? requestUrl?.hostname ?? null;
  return isAllowed(hostname);
}
