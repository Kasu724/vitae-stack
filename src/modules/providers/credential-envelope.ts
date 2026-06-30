import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { z } from "zod";

export interface CredentialContext {
  workspaceId: string;
  configurationId: string;
  providerKind: "openai_compatible" | "ollama";
}

export interface CredentialEnvelope {
  ciphertext: string;
  nonce: string;
  tag: string;
  keyVersion: number;
  lastFour: string;
}

export class CredentialUnavailableError extends Error {
  public constructor() {
    super("The provider credential is unavailable. Re-enter or rotate it.");
    this.name = "CredentialUnavailableError";
  }
}

function decodeMasterKey(encoded: string | undefined): Buffer {
  try {
    if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) throw new Error();
    const key = Buffer.from(encoded, "base64");
    if (key.length !== 32 || key.toString("base64") !== encoded) {
      key.fill(0);
      throw new Error();
    }
    return key;
  } catch {
    throw new CredentialUnavailableError();
  }
}

function authenticatedContext(context: CredentialContext): Buffer {
  const parsed = z
    .object({
      workspaceId: z.string().uuid(),
      configurationId: z.string().uuid(),
      providerKind: z.enum(["openai_compatible", "ollama"]),
    })
    .parse(context);
  return Buffer.from(
    `vitae-provider-credential:v1:${parsed.workspaceId}:${parsed.configurationId}:${parsed.providerKind}`,
    "utf8",
  );
}

export function encryptCredential(
  credential: string,
  encodedMasterKey: string | undefined,
  keyVersion: number,
  context: CredentialContext,
): CredentialEnvelope {
  const value = z.string().min(1).max(4096).parse(credential);
  const version = z.number().int().positive().parse(keyVersion);
  const key = decodeMasterKey(encodedMasterKey);
  const nonce = randomBytes(12);
  const plaintext = Buffer.from(value, "utf8");
  try {
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(authenticatedContext(context));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: ciphertext.toString("base64"),
      nonce: nonce.toString("base64"),
      tag: tag.toString("base64"),
      keyVersion: version,
      lastFour: value.slice(-4),
    };
  } finally {
    key.fill(0);
    plaintext.fill(0);
    nonce.fill(0);
  }
}

export function decryptCredential(
  envelope: CredentialEnvelope,
  encodedMasterKey: string | undefined,
  context: CredentialContext,
): string {
  const key = decodeMasterKey(encodedMasterKey);
  let plaintext: Buffer | undefined;
  try {
    const nonce = Buffer.from(envelope.nonce, "base64");
    const tag = Buffer.from(envelope.tag, "base64");
    const ciphertext = Buffer.from(envelope.ciphertext, "base64");
    if (nonce.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(authenticatedContext(context));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    throw new CredentialUnavailableError();
  } finally {
    key.fill(0);
    plaintext?.fill(0);
  }
}
