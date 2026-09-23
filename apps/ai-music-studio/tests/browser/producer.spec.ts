import { expect, test } from "@playwright/test";

test("producer retains song context and reports a missing configured provider", async ({ page, request }) => {
  const session = await (await request.get("/api/v1/auth/session")).json();
  const headers = { Origin: "http://localhost:3210", "X-CSRF-Token": session.csrf_token };
  const project = await request.post("/api/v1/projects", {
    data: { name: `Producer browser ${crypto.randomUUID().slice(0, 8)}` }, headers,
  });
  expect(project.status()).toBe(201);
  const song = await request.post(`/api/v1/projects/${(await project.json()).id}/songs`, {
    data: { title: "A patient new idea", brief: "A soft bass pulse with a hopeful lift.", bpm: 118 }, headers,
  });
  expect(song.status()).toBe(201);
  const songId = (await song.json()).id;
  await page.goto(`/producer?song_id=${songId}`);
  await expect(page.getByRole("heading", { name: "AI Producer", exact: true })).toBeVisible();
  await expect(page.getByText("A patient new idea", { exact: true })).toBeVisible();
  await expect(page.getByText("No plan yet. Connect and enable an AI producer in Settings, then create the first version.", { exact: true })).toBeVisible();
  const response = page.waitForResponse(value => value.url().endsWith(`/api/v1/songs/${songId}/production-plans`) && value.request().method() === "POST");
  await page.getByRole("button", { name: "Create production plan", exact: true }).click();
  expect((await response).status()).toBe(409);
  await expect(page.getByText("Choose an enabled AI producer in Settings", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
