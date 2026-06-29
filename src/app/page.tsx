import Link from "next/link";

export default function HomePage() {
  const authenticationMode =
    process.env.AUTH_MODE === "trusted-local" ? "trusted-local" : "password";
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16"
    >
      <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        M02 database foundation
      </p>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Vitae Stack
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-[var(--muted)]">
        A privacy-first platform for evidence-grounded resumes and cover
        letters. Product workflows are being implemented milestone by milestone
        and are not available in this foundation build.
      </p>
      <section
        className="mt-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
        aria-labelledby="principles-heading"
      >
        <h2 id="principles-heading" className="text-xl font-semibold">
          Non-negotiable product behavior
        </h2>
        <ul className="mt-4 list-disc space-y-2 pl-6">
          <li>Generated factual claims must cite approved evidence.</li>
          <li>Unsupported claims cannot enter a final export.</li>
          <li>ATS feedback is an explainable estimate, never a guarantee.</li>
          <li>Default deployment remains self-hostable.</li>
        </ul>
      </section>
      <p className="mt-8 text-sm text-[var(--muted)]">
        Implementation status and requirements are maintained in the repository
        documentation.
      </p>
      <Link
        className="mt-8 w-fit rounded-lg bg-[var(--foreground)] px-5 py-2.5 font-semibold text-[var(--background)]"
        href={authenticationMode === "password" ? "/sign-in" : "/dashboard"}
      >
        {authenticationMode === "password" ? "Sign in" : "Open local workspace"}
      </Link>
    </main>
  );
}
