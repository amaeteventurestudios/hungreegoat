import { expect, test } from "@playwright/test";
import { tinyWav } from "./audio-fixture";

test("mastering setup, A/B review, and delivery controls stay usable", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const session = await (await request.get("/api/v1/auth/session")).json();
  const headers = { Origin: "http://localhost:3210", "X-CSRF-Token": session.csrf_token };
  const project = await request.post("/api/v1/projects", { data: { name: `Mastering ${crypto.randomUUID().slice(0, 8)}` }, headers });
  expect(project.status()).toBe(201);
  const projectId = (await project.json()).id;
  const song = await request.post(`/api/v1/projects/${projectId}/songs`, { data: { title: "Finish this mix" }, headers });
  expect(song.status()).toBe(201);
  const songId = (await song.json()).id;
  const sourceId = crypto.randomUUID();
  const masterAssetId = crypto.randomUUID();
  const masterId = crypto.randomUUID();
  const stemSetId = crypto.randomUUID();
  const wav = tinyWav();
  const asset = { id: sourceId, project_id: projectId, song_id: songId, kind: "mix", original_filename: "source.wav", media_type: "audio/wav", byte_size: wav.length, duration_seconds: 1, sample_rate: 22050, channels: 1, sha256: "0".repeat(64), created_at: new Date().toISOString() };
  let mastered = false;
  let exportFormat: string | null = null;
  let packaged = false;
  await page.route(`**/api/v1/assets?*song_id=${songId}*`, route => route.fulfill({ json: { items: [asset] } }));
  await page.route("**/api/v1/assets/*/stream", route => route.fulfill({ contentType: "audio/wav", body: wav }));
  await page.route(`**/api/v1/assets/${sourceId}/masters*`, route => {
    if (route.request().method() === "POST") { mastered = true; return route.fulfill({ status: 202, json: { job_id: crypto.randomUUID(), state: "pending" } }); }
    return route.fulfill({ json: { items: mastered ? [{ id: masterId, source_asset_id: sourceId, reference_asset_id: null, asset_id: masterAssetId, engine: "ffmpeg-loudnorm", settings: { target_lufs: -14, true_peak_dbtp: -1 }, created_at: new Date().toISOString() }] : [] } });
  });
  await page.route(`**/api/v1/assets/${sourceId}/stem-sets*`, route => route.fulfill({ json: { items: [{ id: stemSetId, source_asset_id: sourceId, engine: "demucs", engine_version: "4.0.1-htdemucs", stems: ["vocals", "drums", "bass", "other"].map(label => ({ id: crypto.randomUUID(), label, asset_id: crypto.randomUUID() })), created_at: new Date().toISOString() }] } }));
  await page.route(`**/api/v1/stem-sets/${stemSetId}/exports*`, route => {
    if (route.request().method() === "POST") { packaged = true; return route.fulfill({ status: 202, json: { job_id: crypto.randomUUID(), state: "pending" } }); }
    return route.fulfill({ json: { items: packaged ? [{ id: crypto.randomUUID(), stem_set_id: stemSetId, byte_size: 1000, sha256: "0".repeat(64), manifest: {}, created_at: new Date().toISOString() }] : [] } });
  });
  await page.route(`**/api/v1/assets/${masterAssetId}/exports*`, route => {
    if (route.request().method() === "POST") { exportFormat = route.request().postDataJSON().format; return route.fulfill({ status: 202, json: { job_id: crypto.randomUUID(), state: "pending" } }); }
    return route.fulfill({ json: { items: exportFormat ? [{ id: crypto.randomUUID(), source_asset_id: masterAssetId, asset_id: crypto.randomUUID(), format: exportFormat, settings: { mp3_bitrate_kbps: 192 }, created_at: new Date().toISOString() }] : [] } });
  });
  await page.goto(`/mastering?song_id=${songId}`);
  await expect(page.getByRole("heading", { name: "Mastering & Export" })).toBeVisible();
  await page.getByRole("button", { name: "Create master" }).click();
  await expect(page.getByText("Mastering queued.", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "Master versions" }).click();
  await page.getByRole("button", { name: "Refresh masters" }).click();
  await expect(page.getByRole("button", { name: "A/B select" })).toBeVisible();
  await page.getByRole("tab", { name: "Exports & delivery" }).click();
  await page.getByRole("button", { name: "Create stems ZIP" }).click();
  await expect(page.getByText("Stem ZIP package queued.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Refresh packages" }).click();
  await expect(page.getByRole("link", { name: /Stem package/ })).toHaveAttribute("href", /\/api\/v1\/stem-packages\/.*\/download/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
