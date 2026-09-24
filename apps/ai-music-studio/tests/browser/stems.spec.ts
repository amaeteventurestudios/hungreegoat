import { expect, test } from "@playwright/test";
import { tinyWav } from "./audio-fixture";

test("stem mixer offers four controls and saves a non-destructive mix", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const session = await (await request.get("/api/v1/auth/session")).json();
  const headers = { Origin: "http://localhost:3210", "X-CSRF-Token": session.csrf_token };
  const project = await request.post("/api/v1/projects", { data: { name: `Stems ${crypto.randomUUID().slice(0, 8)}` }, headers });
  expect(project.status()).toBe(201);
  const projectId = (await project.json()).id;
  const song = await request.post(`/api/v1/projects/${projectId}/songs`, { data: { title: "Four-track review" }, headers });
  expect(song.status()).toBe(201);
  const songId = (await song.json()).id;
  const sourceId = crypto.randomUUID();
  const stemSetId = crypto.randomUUID();
  const labels = ["vocals", "drums", "bass", "other"] as const;
  const audio = tinyWav();
  const asset = { id: sourceId, project_id: projectId, song_id: songId, kind: "uploaded", original_filename: "original.wav", media_type: "audio/wav", byte_size: audio.length, duration_seconds: 1, sample_rate: 22050, channels: 1, sha256: "0".repeat(64), created_at: new Date().toISOString() };
  let separated = false;
  let levels: Record<string, number> | null = null;
  await page.route(`**/api/v1/assets?*song_id=${songId}*`, route => route.fulfill({ json: { items: [asset] } }));
  await page.route("**/api/v1/assets/*/stream", route => route.fulfill({ contentType: "audio/wav", body: audio }));
  await page.route(`**/api/v1/assets/${sourceId}/stem-sets*`, route => {
    if (route.request().method() === "POST") { separated = true; return route.fulfill({ status: 202, json: { stem_set_id: stemSetId, job_id: crypto.randomUUID(), state: "pending" } }); }
    return route.fulfill({ json: { items: separated ? [{ id: stemSetId, source_asset_id: sourceId, engine: "demucs", engine_version: "4.0.1-htdemucs", created_at: new Date().toISOString(), stems: labels.map(label => ({ id: crypto.randomUUID(), label, asset_id: crypto.randomUUID() })) }] : [] } });
  });
  await page.route(`**/api/v1/stem-sets/${stemSetId}/mix-versions*`, route => {
    if (route.request().method() === "POST") { levels = route.request().postDataJSON().levels; return route.fulfill({ status: 202, json: { job_id: crypto.randomUUID(), state: "pending" } }); }
    return route.fulfill({ json: { items: levels ? [{ id: crypto.randomUUID(), stem_set_id: stemSetId, asset_id: crypto.randomUUID(), version: 1, levels, created_at: new Date().toISOString() }] : [] } });
  });
  await page.goto(`/stems?song_id=${songId}`);
  await expect(page.getByRole("heading", { name: "Stems & Mixing" })).toBeVisible();
  await page.getByRole("button", { name: "Separate into stems" }).click();
  await page.getByRole("button", { name: "Refresh stem sets" }).click();
  await expect(page.getByText("Four-track mixer")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download Vocals" })).toBeVisible();
  await page.getByRole("slider", { name: "Vocals volume" }).fill("0.7");
  await page.getByRole("button", { name: "Save mix version" }).click();
  expect(levels).toMatchObject({ vocals: 0.7, drums: 1, bass: 1, other: 1 });
  await page.getByRole("tab", { name: "Stem sets & mixes" }).click();
  await page.getByRole("button", { name: "Refresh mix history" }).click();
  await expect(page.getByText("Mix 1", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
