import { readServerEnvironment } from "@/infrastructure/config/environment";
import { handleAuthRequest } from "@/modules/auth/auth-request-handler";
import { getAuth } from "@/modules/auth/server";

async function handle(request: Request): Promise<Response> {
  const environment = readServerEnvironment();
  if (environment.AUTH_MODE !== "password") {
    return Response.json(
      { error: "Authentication endpoints are disabled in trusted-local mode." },
      { status: 404 },
    );
  }
  return handleAuthRequest(getAuth(), request, environment.BETTER_AUTH_URL);
}

export const GET = handle;
export const POST = handle;
