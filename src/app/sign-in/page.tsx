import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { readServerEnvironment } from "@/infrastructure/config/environment";
import { SignInForm } from "@/modules/auth/components/sign-in-form";
import { getCurrentPrincipal } from "@/modules/auth/principal";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const environment = readServerEnvironment();
  if (environment.AUTH_MODE === "trusted-local") redirect("/dashboard");
  if (await getCurrentPrincipal(await headers())) redirect("/dashboard");

  return (
    <main id="main-content" className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold">Sign in</h1>
      <p className="mt-3 text-[var(--muted)]">
        Registration is closed. The deployment operator creates the first
        account with the documented bootstrap command.
      </p>
      <SignInForm />
    </main>
  );
}
