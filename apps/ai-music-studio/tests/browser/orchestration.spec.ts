import { expect, test, type APIRequestContext, type Locator } from "@playwright/test";
import { createDiagnostic, diagnosticProject } from "./diagnostic-fixture";

test.describe.configure({ mode: "default", timeout: 90000 });
let pageErrors: string[] = [];
test.beforeEach(async ({ context }) => {
  pageErrors = [];
  const observe = (page: import("@playwright/test").Page) => page.on("pageerror", error => pageErrors.push(error.message));
  context.pages().forEach(observe);
  context.on("page", observe);
});
test.afterEach(() => expect(pageErrors).toEqual([]));

async function job(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/v1/jobs/${id}`);
  expect(response.status()).toBe(200);
  const value = await response.json();
  for (const privateField of ["parameters", "lease_token", "lease_hash", "execution_id", "worker_token", "credentials"]) expect(value).not.toHaveProperty(privateField);
  return value;
}

async function state(request: APIRequestContext, id: string, expected: string) {
  await expect.poll(async () => (await job(request, id)).state, { timeout: 60000, intervals: [250, 500, 1000] }).toBe(expected);
  return job(request, id);
}

function badge(card: Locator, value: string) {
  return card.getByText(value, { exact: true });
}

test("real diagnostic execution reports progress and survives a closed browser page", async ({ page, context, request }, testInfo) => {
  const project = await diagnosticProject();
  const id = await createDiagnostic(project, 12);
  await page.goto(`/projects/${project}`);
  const card = page.locator(`[data-job-id="${id}"]`);
  await expect(card).toBeVisible();
  await expect(card.getByText("Local verification only · No music or provider output", { exact: true })).toBeVisible();
  await state(request, id, "running");
  await expect.poll(async () => (await job(request, id)).progress_percent, { timeout: 15000 }).toBeGreaterThan(0);
  await expect(badge(card, "running")).toBeVisible({ timeout: 10000 });
  await expect(card.getByRole("progressbar", { name: "Studio diagnostic progress" })).toHaveAttribute("aria-valuenow", /[1-9]/);
  await context.setOffline(true);
  await expect(page.getByText("You’re offline. Work continues on the server; status will reconnect automatically.", { exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("You’re offline. Work continues on the server; status will reconnect automatically.", { exact: true })).not.toBeVisible();
  await page.reload();
  await expect(card).toBeVisible();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`/projects/${project}`);
  const restored = reopened.locator(`[data-job-id="${id}"]`);
  await expect(restored).toBeVisible();
  const completed = await state(request, id, "succeeded");
  expect(completed).toMatchObject({ attempt: 1, progress_percent: 100, can_retry: false, can_cancel: false, result_asset_id: null });
  await expect(badge(restored, "succeeded")).toBeVisible({ timeout: 15000 });
  const events = await (await request.get(`/api/v1/jobs/${id}/events`)).json();
  expect(events.items.map((event: { state: string }) => event.state)).toEqual(expect.arrayContaining(["running", "succeeded"]));
  await restored.getByRole("button", { name: "Job history", exact: true }).click();
  const history = reopened.getByRole("dialog", { name: "Studio diagnostic history", exact: true });
  await expect(history.getByText("Job completed", { exact: true })).toBeVisible();
  await expect(history.getByText("Durable events across attempts. Current attempt: 1.", { exact: true })).toBeVisible();
  await reopened.screenshot({ path: testInfo.outputPath("successful-job-history.png"), fullPage: true, animations: "disabled" });
  await reopened.close();
});

test("diagnostic failure stays visible and a deliberate retry retains attempt history", async ({ page, request }, testInfo) => {
  const project = await diagnosticProject();
  const id = await createDiagnostic(project, 1, true);
  const failed = await state(request, id, "failed");
  expect(failed).toMatchObject({ attempt: 1, can_retry: true, can_cancel: false, outcome_unknown: false });
  expect(failed.error_code).toBeTruthy();
  expect(failed.error_message).toBeTruthy();
  expect(JSON.stringify(failed)).not.toMatch(/Traceback|Bearer |\/run\/secrets|api[_-]?key=/i);
  await page.goto(`/projects/${project}`);
  const card = page.locator(`[data-job-id="${id}"]`);
  await expect(badge(card, "failed")).toBeVisible();
  await expect(card.getByText(failed.error_message, { exact: false })).toBeVisible();
  for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await card.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`job-failure-${width}.png`), fullPage: true, animations: "disabled" });
  }
  await page.reload();
  await expect(badge(card, "failed")).toBeVisible();
  await card.getByRole("button", { name: "Retry job", exact: true }).click();
  const completed = await state(request, id, "succeeded");
  expect(completed).toMatchObject({ attempt: 2, progress_percent: 100, can_retry: false, error_code: null, error_message: null });
  await expect(badge(card, "succeeded")).toBeVisible({ timeout: 15000 });
  await expect(card.getByText(/^Attempt 2 ·/)).toBeVisible();
  await card.getByRole("button", { name: "Job history", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Studio diagnostic history", exact: true });
  await expect(history.getByText("Job failed", { exact: true })).toBeVisible();
  await expect(history.getByText("Job completed", { exact: true })).toBeVisible();
  await expect(history.getByText("Durable events across attempts. Current attempt: 2.", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("retry-history-mobile.png"), fullPage: true, animations: "disabled" });
});

test("running diagnostic can be cancelled without producing an audio asset", async ({ page, request }, testInfo) => {
  const project = await diagnosticProject();
  const id = await createDiagnostic(project, 30);
  await state(request, id, "running");
  await page.goto(`/projects/${project}`);
  const card = page.locator(`[data-job-id="${id}"]`);
  await expect(badge(card, "running")).toBeVisible();
  await card.getByRole("button", { name: "Cancel job", exact: true }).click();
  const cancelled = await state(request, id, "cancelled");
  expect(cancelled).toMatchObject({ can_cancel: false, result_asset_id: null });
  await page.reload();
  await expect(badge(card, "cancelled")).toBeVisible();
  await expect(card.getByRole("button", { name: "Cancel job", exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("cancelled-job.png"), fullPage: true, animations: "disabled" });
});
