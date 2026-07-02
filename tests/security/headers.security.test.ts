// @vitest-environment node

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, proxy } from "@/proxy";

describe("browser security headers", () => {
  it("uses a strict per-request nonce without unsafe inline scripts", () => {
    const first = proxy(new NextRequest("https://vitae.example/dashboard"));
    const second = proxy(new NextRequest("https://vitae.example/dashboard"));
    const firstPolicy = first.headers.get("content-security-policy");
    const secondPolicy = second.headers.get("content-security-policy");
    expect(firstPolicy).toMatch(
      /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/u,
    );
    expect(firstPolicy).toContain("object-src 'none'");
    expect(firstPolicy).toContain("frame-ancestors 'none'");
    expect(firstPolicy).not.toContain("'unsafe-inline'");
    expect(secondPolicy).not.toBe(firstPolicy);
  });

  it("allows development eval only in the explicit development policy", () => {
    expect(contentSecurityPolicy("synthetic", true)).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy("synthetic", false)).not.toContain(
      "'unsafe-eval'",
    );
  });
});
