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
  return request.headers.get("origin") === new URL(configuredBaseURL).origin;
}
