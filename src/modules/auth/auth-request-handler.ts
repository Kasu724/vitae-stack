import type { VitaeAuth } from "./auth-factory";

export async function handleAuthRequest(
  auth: VitaeAuth,
  request: Request,
  configuredBaseURL: string,
): Promise<Response> {
  if (!new Set(["GET", "HEAD", "OPTIONS"]).has(request.method)) {
    if (!isTrustedRequestOrigin(request, configuredBaseURL)) {
      return Response.json(
        { error: "Untrusted request origin." },
        { status: 403 },
      );
    }
  }

  return auth.handler(request);
}

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
