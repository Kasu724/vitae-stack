"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "../client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <div className="text-right">
      <button
        className="rounded-lg border border-[var(--border)] px-4 py-2 font-medium disabled:opacity-60"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            const result = await authClient.signOut();
            if (result.error) {
              setError("Sign-out failed. Try again.");
              return;
            }
            router.replace("/sign-in");
            router.refresh();
          } catch {
            setError("Sign-out failed. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <p className="mt-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
