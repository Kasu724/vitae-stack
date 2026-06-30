import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  CredentialUnavailableError,
  decryptCredential,
  encryptCredential,
} from "@/modules/providers/credential-envelope";

const context = {
  workspaceId: "10000000-0000-4000-8000-000000000001",
  configurationId: "20000000-0000-4000-8000-000000000002",
  providerKind: "openai_compatible" as const,
};

describe("provider credential envelopes", () => {
  it("round-trips AES-256-GCM with a fresh per-record nonce", () => {
    const key = randomBytes(32).toString("base64");
    const first = encryptCredential("synthetic-secret-1234", key, 1, context);
    const second = encryptCredential("synthetic-secret-1234", key, 1, context);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toContain("synthetic-secret");
    expect(first.lastFour).toBe("1234");
    expect(decryptCredential(first, key, context)).toBe(
      "synthetic-secret-1234",
    );
  });

  it("fails generically for the wrong key, context, or modified ciphertext", () => {
    const key = randomBytes(32).toString("base64");
    const envelope = encryptCredential("synthetic-secret", key, 1, context);
    const attempts = [
      () =>
        decryptCredential(
          envelope,
          randomBytes(32).toString("base64"),
          context,
        ),
      () =>
        decryptCredential(envelope, key, {
          ...context,
          workspaceId: "30000000-0000-4000-8000-000000000003",
        }),
      () =>
        decryptCredential(
          {
            ...envelope,
            ciphertext: `${envelope.ciphertext.slice(0, -4)}AAAA`,
          },
          key,
          context,
        ),
    ];
    for (const attempt of attempts)
      expect(attempt).toThrow(CredentialUnavailableError);
  });

  it("rejects missing or malformed master keys without exposing cryptographic details", () => {
    expect(() =>
      encryptCredential("synthetic-secret", undefined, 1, context),
    ).toThrow(CredentialUnavailableError);
    expect(() =>
      encryptCredential("synthetic-secret", "not-base64", 1, context),
    ).toThrow("The provider credential is unavailable");
  });
});
