"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { authClient } from "../client";

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    if (!email || !password) {
      setError("Enter both your email and password.");
      setSubmitting(false);
      return;
    }

    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError("Sign-in failed. Check your credentials and try again.");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Sign-in is temporarily unavailable. Try again shortly.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={submit} noValidate>
      <div>
        <label className="block font-medium" htmlFor="email">
          Email
        </label>
        <input
          className="field mt-2"
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          aria-describedby={error ? "sign-in-error" : undefined}
          aria-invalid={error ? true : undefined}
          required
        />
      </div>
      <div>
        <label className="block font-medium" htmlFor="password">
          Password
        </label>
        <input
          className="field mt-2"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-describedby={error ? "sign-in-error" : undefined}
          aria-invalid={error ? true : undefined}
          required
        />
      </div>
      {error ? (
        <p
          className="rounded-lg border border-[var(--danger)] bg-[var(--surface)] p-3 text-sm text-[var(--danger)]"
          id="sign-in-error"
          ref={errorRef}
          role="alert"
          tabIndex={-1}
        >
          {error}
        </p>
      ) : null}
      <button
        className="button disabled:opacity-60"
        type="submit"
        disabled={submitting}
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
