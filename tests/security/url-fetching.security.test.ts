import { describe, expect, it } from "vitest";

import { extractJobTextFromHtml } from "@/modules/job-fetch/html-text";
import { fetchPublicJobDescription } from "@/modules/job-fetch/fetcher";
import {
  isPublicAddress,
  validatePublicJobUrl,
} from "@/modules/job-fetch/network-policy";

describe("job URL network policy", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "192.0.2.1",
    "224.0.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "2002:7f00:1::",
  ])("blocks nonpublic or transition address %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "allows globally routable address %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );

  it.each([
    "http://example.com/job",
    "https://user:secret@example.com/job",
    "https://127.0.0.1/job",
    "https://[::1]/job",
    "https://localhost/job",
    "https://example.com:8443/job",
  ])("rejects unsafe URL %s", (url) => {
    expect(() => validatePublicJobUrl(url)).toThrow();
  });

  it("canonicalizes a public HTTPS URL without its fragment", () => {
    expect(
      validatePublicJobUrl(" https://Example.com/job?q=1#details ").href,
    ).toBe("https://example.com/job?q=1");
  });

  it("extracts inert text without active or embedded content", () => {
    const text = extractJobTextFromHtml(`
      <main><h1>Engineer</h1><p>Build safe systems &amp; tests.</p>
      <script>stealSecrets()</script><style>.hidden{}</style>
      <iframe>private metadata</iframe><form>credential prompt</form></main>`);
    expect(text).toContain("Engineer");
    expect(text).toContain("Build safe systems & tests.");
    expect(text).not.toContain("stealSecrets");
    expect(text).not.toContain("private metadata");
    expect(text).not.toContain("credential prompt");
  });

  it("rejects mixed public/private DNS answers before connecting", async () => {
    await expect(
      fetchPublicJobDescription("https://example.com/job", {
        resolve: (async () => [
          { address: "8.8.8.8", family: 4 },
          { address: "127.0.0.1", family: 4 },
        ]) as never,
      }),
    ).rejects.toMatchObject({ code: "NONPUBLIC_ADDRESS" });
  });

  it("counts DNS resolution against the total timeout", async () => {
    await expect(
      fetchPublicJobDescription("https://example.com/job", {
        resolve: (() => new Promise(() => undefined)) as never,
      }),
    ).rejects.toMatchObject({ code: "FETCH_TIMEOUT" });
  }, 15_000);
});
