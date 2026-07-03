export function isTrustedRequestOrigin(
  request: Request,
  configuredBaseURL: string,
): boolean {
  const configured = new URL(configuredBaseURL);
  const configuredOrigin = configured.origin;
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") return origin === configuredOrigin;
  return (
    request.headers.get("sec-fetch-site") === "same-origin" &&
    request.headers.get("host") === configured.host
  );
}
