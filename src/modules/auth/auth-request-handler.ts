import type { VitaeAuth } from "./auth-factory";

export async function handleAuthRequest(
  auth: VitaeAuth,
  request: Request,
  configuredBaseURL: string,
): Promise<Response> {
  if (!new Set(["GET", "HEAD", "OPTIONS"]).has(request.method)) {
    const origin = request.headers.get("origin");
    const trustedOrigin = new URL(configuredBaseURL).origin;
    if (origin !== trustedOrigin) {
      return Response.json(
        { error: "Untrusted request origin." },
        { status: 403 },
      );
    }
  }

  return auth.handler(request);
}
