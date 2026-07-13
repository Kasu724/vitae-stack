import Link from "next/link";

export default function HomePage() {
  return (
    <main
      id="main-content"
      className="landing-page mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-6 py-16 sm:px-10 lg:px-14"
    >
      <div className="landing-grid">
        <div>
          <div className="landing-brand">
            <span className="app-brand-mark" aria-hidden="true">
              VS
            </span>
            <p className="text-sm font-semibold text-[var(--muted-strong)]">
              Local career documents
            </p>
          </div>
          <h1 className="mt-10 max-w-xl text-4xl font-bold tracking-tight sm:text-5xl">
            Vitae Stack
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--muted)]">
            Maintain approved career evidence, compare it with reviewed job
            requirements, tailor resumes and cover letters, inspect every
            factual claim, and export documents or your complete portable data.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link className="button" href="/dashboard">
              Open local workspace
            </Link>
            <span className="local-status">
              <span aria-hidden="true" /> Runs on this device
            </span>
          </div>
          <p className="mt-8 max-w-xl text-sm leading-6 text-[var(--muted)]">
            You choose what evidence and experiences to include. Every proposed
            document change remains reviewable before it creates a version.
          </p>
        </div>
        <section
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-[var(--shadow-raised)] sm:p-8"
          aria-labelledby="principles-heading"
        >
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--muted)]">
            Built-in safeguards
          </p>
          <h2 id="principles-heading" className="mt-2 text-xl font-semibold">
            Clear rules for every document
          </h2>
          <ul className="principles-list mt-6">
            <li>Generated factual claims must cite approved evidence.</li>
            <li>Unsupported claims cannot enter a final export.</li>
            <li>ATS feedback is an explainable estimate, never a guarantee.</li>
            <li>
              Your records and documents remain in your local data folder.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
