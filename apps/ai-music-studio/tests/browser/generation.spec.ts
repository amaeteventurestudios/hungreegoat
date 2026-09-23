import { expect, test } from "@playwright/test";

test("generation retains song context and reports missing music setup without a provider call", async ({ page, request }) => {
  const session = await (await request.get("/api/v1/auth/session")).json();
  const headers = { Origin: "http://localhost:3210", "X-CSRF-Token": session.csrf_token };
  const project = await request.post("/api/v1/projects", {
    data: { name: `Generation browser ${crypto.randomUUID().slice(0, 8)}` }, headers,
  });
  expect(project.status()).toBe(201);
  const song = await request.post(`/api/v1/projects/${(await project.json()).id}/songs`, {
    data: { title: "A durable listening idea", brief: "A gentle pulse with evolving harmony.", bpm: 112 }, headers,
  });
  expect(song.status()).toBe(201);
  const songId = (await song.json()).id;
  await page.goto(`/generation?song_id=${songId}`);
  await expect(page.getByRole("heading", { name: "Generation", exact: true })).toBeVisible();
  await expect(page.getByText("A durable listening idea", { exact: true })).toBeVisible();
  const response = page.waitForResponse(value => value.url().endsWith(`/api/v1/songs/${songId}/generations`) && value.request().method() === "POST");
  await page.getByRole("button", { name: "Generate versions", exact: true }).click();
  expect((await response).status()).toBe(409);
  await expect(page.getByText("Create a production plan before generating music", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
