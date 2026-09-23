import { expect, test } from "@playwright/test";

test("workspace loads, connects to the real API, and fits its viewport", async ({ page, request }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const ready = await request.get("/api/v1/health/ready");
  expect(ready.status()).toBe(200);
  expect(await ready.json()).toMatchObject({ status: "ok", service: "studio-api", database: "ok" });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Studio connected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check connection" }).click();
  await expect(page.getByText("Studio connected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check connection" })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(geometry.content).toBeLessThanOrEqual(geometry.width);
  expect(errors).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("workspace.png"), fullPage: true });
});

test("connection failure is visible and retry recovers", async ({ page }, testInfo) => {
  let unavailable = true;
  await page.route("**/api/v1/health/ready", async (route) => {
    if (unavailable) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ status: "unavailable" }) });
    } else {
      await route.continue();
    }
  });
  await page.goto("/");
  await expect(page.getByText("Studio API unavailable", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("connection-error.png"), fullPage: true });
  unavailable = false;
  await page.getByRole("button", { name: "Check connection" }).click();
  await expect(page.getByText("Studio connected", { exact: true })).toBeVisible();
});
