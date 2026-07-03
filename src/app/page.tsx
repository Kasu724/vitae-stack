import Link from "next/link";

export default function HomePage() {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16"
    >
      <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Local career documents
      </p>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Vitae Stack
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-[var(--muted)]">
        Maintain approved career evidence, compare it with reviewed job
        requirements, tailor resumes and cover letters, inspect every factual
        claim, and export documents or your complete portable data.
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
          <li>Your records and documents remain in your local data folder.</li>
        </ul>
      </section>
      <p className="mt-8 text-sm text-[var(--muted)]">
        You choose what evidence and experiences to include, and every proposed
        document change remains reviewable before it creates a version.
      </p>
      <Link className="button mt-8 w-fit" href="/dashboard">
        Open local workspace
      </Link>
    </main>
  );
}
