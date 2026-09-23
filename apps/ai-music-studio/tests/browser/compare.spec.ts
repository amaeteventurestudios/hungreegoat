import { expect, test } from "@playwright/test";
import { tinyWav } from "./audio-fixture";

test("listening review renders waveforms and persists A/B decisions", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const session = await (await request.get("/api/v1/auth/session")).json();
  const headers = { Origin: "http://localhost:3210", "X-CSRF-Token": session.csrf_token };
  const project = await request.post("/api/v1/projects", { data: { name: `Compare ${crypto.randomUUID().slice(0, 8)}` }, headers });
  expect(project.status()).toBe(201);
  const song = await request.post(`/api/v1/projects/${(await project.json()).id}/songs`, { data: { title: "Two warm versions" }, headers });
  expect(song.status()).toBe(201);
  const songId = (await song.json()).id;
  const generationId = crypto.randomUUID();
  const tone = tinyWav();
  const pcm = tone.subarray(44);
  const audio = Buffer.alloc(44 + pcm.length * 6);
  tone.copy(audio, 0, 0, 44);
  for (let index = 0; index < 6; index++) pcm.copy(audio, 44 + index * pcm.length);
  audio.writeUInt32LE(audio.length - 8, 4);
  audio.writeUInt32LE(audio.length - 44, 40);
  const versions = [1, 2].map(version => ({
    id: crypto.randomUUID(), generation_id: generationId, version,
    asset_id: crypto.randomUUID(), approved: false, rejected: false, favorite: false,
    notes: "", provider_request_id: `test-${version}`, metadata: {}, created_at: new Date().toISOString(),
  }));
  await page.route(`**/api/v1/songs/${songId}/generations*`, route => route.fulfill({ json: { items: [{ id: generationId, song_id: songId, model: "music_v2" }] } }));
  await page.route(`**/api/v1/generations/${generationId}/versions*`, route => route.fulfill({ json: { items: versions } }));
  for (const version of versions) {
    await page.route(`**/api/v1/assets/${version.asset_id}/stream`, route => route.fulfill({ status: 200, contentType: "audio/wav", body: audio }));
    await page.route(`**/api/v1/generation-versions/${version.id}`, async route => {
      const update = route.request().postDataJSON();
      Object.assign(version, update);
      if (update.approved) version.rejected = false;
      if (update.rejected) version.approved = false;
      await route.fulfill({ json: version });
    });
  }
  await page.goto(`/compare?song_id=${songId}`);
  await expect(page.getByRole("heading", { name: "Listen & Compare" })).toBeVisible();
  const a = page.locator('[aria-label="Compare slot A"]');
  const b = page.locator('[aria-label="Compare slot B"]');
  await expect(a.getByRole("button", { name: "Play A" })).toBeEnabled();
  await expect(b.getByRole("button", { name: "Play B" })).toBeEnabled();
  await a.getByRole("button", { name: "Play A" }).click();
  await expect(a.getByRole("button", { name: "Pause A" })).toBeVisible();
  await b.getByRole("button", { name: "Play B" }).click();
  await expect(a.getByRole("button", { name: "Play A" })).toBeVisible();
  await expect(b.getByRole("button", { name: "Pause B" })).toBeVisible();
  await b.getByRole("button", { name: "Pause B" }).click();
  await a.getByRole("button", { name: "Favorite" }).click();
  await expect(a.getByRole("button", { name: "Favorite" })).toHaveAttribute("aria-pressed", "true");
  await a.getByRole("button", { name: "Approve" }).click();
  await expect(a.getByText("Approved", { exact: false })).toBeVisible();
  await a.getByRole("button", { name: "Reject" }).click();
  await expect(a.getByText("Rejected", { exact: false })).toBeVisible();
  await a.getByRole("textbox", { name: "Listening notes" }).fill("Softer opening, stronger outro.");
  await a.getByRole("button", { name: "Save notes" }).click();
  await expect(a.getByRole("button", { name: "Save notes" })).toBeDisabled();
  expect(versions[0]).toMatchObject({ favorite: true, approved: false, rejected: true, notes: "Softer opening, stronger outro." });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
