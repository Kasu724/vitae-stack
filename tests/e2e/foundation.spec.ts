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

  const entranceMotion = await page
    .locator("#main-content > *")
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        name: style.animationName,
        duration: style.animationDuration,
      };
    });
  expect(entranceMotion).toEqual({
    name: "motion-reveal",
    duration: "0.18s",
  });

  await page.goto("/dashboard");
  const applicationNavigation = page.getByRole("complementary", {
    name: "Application navigation",
  });
  await expect(applicationNavigation).toBeVisible();
  await expect(
    applicationNavigation.getByRole("link", { name: "Career evidence" }),
  ).toBeVisible();
  await expect(
    applicationNavigation.getByText("Local installation", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#main-content")).toBeVisible();

  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    status: "ok",
    service: "vitae-stack",
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const reducedMotionDurationMs = await page
    .locator("#main-content > *")
    .first()
    .evaluate(
      (element) =>
        Number.parseFloat(getComputedStyle(element).animationDuration) * 1_000,
    );
  expect(reducedMotionDurationMs).toBeLessThanOrEqual(0.01);
});
