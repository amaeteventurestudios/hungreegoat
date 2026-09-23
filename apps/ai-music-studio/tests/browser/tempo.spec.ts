import { expect, test } from "@playwright/test";
import { tinyWav } from "./audio-fixture";

test("tempo workstation analyzes a source and presents immutable variants", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const session = await (await request.get("/api/v1/auth/session")).json();
  const headers = { Origin: "http://localhost:3210", "X-CSRF-Token": session.csrf_token };
  const project = await request.post("/api/v1/projects", { data: { name: `Tempo ${crypto.randomUUID().slice(0, 8)}` }, headers });
  expect(project.status()).toBe(201);
  const song = await request.post(`/api/v1/projects/${(await project.json()).id}/songs`, { data: { title: "New pace", bpm: 120 }, headers });
  expect(song.status()).toBe(201);
  const songId = (await song.json()).id;
  const assetId = crypto.randomUUID();
  const asset = { id: assetId, project_id: (await project.json()).id, song_id: songId, kind: "generated", original_filename: "original.wav", media_type: "audio/wav", byte_size: tinyWav().length, duration_seconds: 1, sample_rate: 22050, channels: 1, sha256: "0".repeat(64), created_at: new Date().toISOString() };
  const measurement = { duration_seconds: 1, sample_rate: 22050, channels: 1, detected_bpm: 120, musical_key: "A minor", loudness_lufs: -16.2, peaks: Array.from({ length: 256 }, (_, index) => index % 2 ? 0.5 : 0.2) };
  let analyzed = false;
  let variant: Record<string, unknown> | null = null;
  await page.route(`**/api/v1/assets?*song_id=${songId}*`, route => route.fulfill({ json: { items: [asset] } }));
  await page.route(`**/api/v1/assets/${assetId}/stream`, route => route.fulfill({ contentType: "audio/wav", body: tinyWav() }));
  await page.route(`**/api/v1/assets/${assetId}/analysis*`, route => {
    if (route.request().method() === "POST") { analyzed = true; return route.fulfill({ status: 202, json: { job_id: crypto.randomUUID(), state: "pending" } }); }
    return route.fulfill({ json: { items: analyzed ? [{ id: crypto.randomUUID(), asset_id: assetId, analyzer_version: "librosa-0.11-ffmpeg-v1", detected_bpm: 120, musical_key: "A minor", measurements: measurement, created_at: new Date().toISOString() }] : [] } });
  });
  await page.route(`**/api/v1/assets/${assetId}/tempo-versions*`, route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      variant = { id: crypto.randomUUID(), source_asset_id: assetId, asset_id: crypto.randomUUID(), ratio: body.target_bpm / body.source_bpm, pitch_semitones: body.pitch_semitones, preserve_pitch: body.preserve_pitch, created_at: new Date().toISOString() };
      return route.fulfill({ status: 202, json: { job_id: crypto.randomUUID(), state: "pending" } });
    }
    return route.fulfill({ json: { items: variant ? [variant] : [] } });
  });
  await page.goto(`/tempo?song_id=${songId}`);
  await expect(page.getByRole("heading", { name: "Tempo / Remix" })).toBeVisible();
  await page.getByRole("button", { name: "Analyze audio" }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("A minor")).toBeVisible();
  await expect(page.getByText("-16.2 LUFS")).toBeVisible();
  await page.getByRole("spinbutton", { name: "Target BPM" }).fill("150");
  await page.getByRole("button", { name: "Apply as new version" }).click();
  await page.getByRole("button", { name: "Refresh versions" }).click();
  await expect(page.getByText("1.25× tempo", { exact: false })).toBeVisible();
  expect(variant).toMatchObject({ ratio: 1.25, preserve_pitch: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
