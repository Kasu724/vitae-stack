import { expect, test } from "@playwright/test";

test("foundation shell and health endpoint are available", async ({
  page,
  request,
}) => {
  const documentResponse = await page.goto("/");
  const policy = documentResponse?.headers()["content-security-policy"];
  expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/u);
  expect(policy).not.toContain("'unsafe-inline'");
  expect(documentResponse?.headers()["x-content-type-options"]).toBe("nosniff");
  await expect(
    page.getByRole("heading", { level: 1, name: "Vitae Stack" }),
  ).toBeVisible();

  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    status: "ok",
    service: "vitae-stack",
  });
});
