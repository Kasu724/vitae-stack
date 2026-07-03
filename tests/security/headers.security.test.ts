// @vitest-environment node

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, proxy } from "@/proxy";

describe("browser security headers", () => {
  it("uses a strict per-request nonce without unsafe inline scripts", () => {
    const first = proxy(
      new NextRequest("http://127.0.0.1:3000/dashboard", {
        headers: { host: "127.0.0.1:3000" },
      }),
    );
    const second = proxy(
      new NextRequest("http://127.0.0.1:3000/dashboard", {
        headers: { host: "127.0.0.1:3000" },
      }),
    );
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

  it("rejects non-loopback and forwarded requests in trusted-local mode", () => {
    const remote = proxy(
      new NextRequest("http://192.0.2.10/dashboard", {
        headers: { host: "192.0.2.10:3000" },
      }),
    );
    const forwarded = proxy(
      new NextRequest("http://127.0.0.1:3000/dashboard", {
        headers: {
          host: "127.0.0.1:3000",
          "x-forwarded-host": "vitae.example.test",
        },
      }),
    );
    const local = proxy(
      new NextRequest("http://127.0.0.1:3000/dashboard", {
        headers: { host: "127.0.0.1:3000" },
      }),
    );

    expect(remote.status).toBe(403);
    expect(forwarded.status).toBe(403);
    expect(local.status).toBe(200);
  });
});
