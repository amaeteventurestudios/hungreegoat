import { expect, test } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { baseURL } from "./auth-state";
import { tinyWav } from "./audio-fixture";

test.describe.configure({ mode: "default" });

test("domain APIs require authentication and hide absent resources", async ({ request, playwright }) => {
  const missing = randomUUID();
  for (const endpoint of [`/projects/${missing}`, `/songs/${missing}`, `/assets/${missing}`, `/assets/${missing}/stream`, `/assets/${missing}/lineage`]) {
    expect((await request.get(`/api/v1${endpoint}`)).status()).toBe(404);
  }
  const anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    for (const endpoint of ["/projects", "/assets", `/assets/${missing}/stream`]) {
      expect((await anonymous.get(`/api/v1${endpoint}`)).status()).toBe(401);
    }
  } finally {
    await anonymous.dispose();
  }
});

test("project, song, and immutable audio survive revisit and support playback and export", async ({ page, request }, testInfo) => {
  test.setTimeout(60000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const marker = randomUUID();
  const projectName = `Studio browser verification ${marker.slice(0, 8)}`;
  const editedProjectName = `${projectName} — warm sessions`;
  const songTitle = `Browser fixture ${marker.slice(0, 8)} — a quiet pulse for a late-night room, with space for an unhurried melody`;
  const filename = `studio-e2e-tone-${marker.slice(0, 8)}.wav`;
  const audioBytes = tinyWav();
  const sha256 = createHash("sha256").update(audioBytes).digest("hex");
  const fixture = { marker, description: "Generated original one-second 220 Hz PCM16 mono test tone; retained for restart verification.", project_id: "", song_id: "", asset_id: "", filename, sha256 };
  const fixturePath = path.resolve(__dirname, `../../test-results/domain-fixtures/${marker}.json`);
  async function record() {
    await mkdir(path.dirname(fixturePath), { recursive: true, mode: 0o700 });
    await writeFile(fixturePath, JSON.stringify(fixture, null, 2), { mode: 0o600 });
  }

  await page.goto("/projects");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "Create a project", exact: true });
  await createDialog.getByRole("textbox", { name: "Project name", exact: true }).fill("   ");
  const invalidProjectResponse = page.waitForResponse((response) => response.url().endsWith("/api/v1/projects") && response.request().method() === "POST");
  await createDialog.getByRole("button", { name: "Create project", exact: true }).click();
  expect((await invalidProjectResponse).status()).toBe(422);
  await expect(createDialog.getByRole("alert")).toBeVisible();
  await createDialog.getByRole("textbox", { name: "Project name", exact: true }).fill(projectName);
  await createDialog.getByRole("textbox", { name: "Description", exact: true }).fill("A private generated-audio fixture for browser and restart verification.");
  await createDialog.getByRole("textbox", { name: "Project tags", exact: true }).fill("browser-fixture, phase05");
  const createdResponse = page.waitForResponse((response) => response.url().endsWith("/api/v1/projects") && response.request().method() === "POST");
  await createDialog.getByRole("button", { name: "Create project", exact: true }).click();
  const created = await createdResponse;
  expect(created.status()).toBe(201);
  fixture.project_id = (await created.json()).id;
  await record();
  await expect(page).toHaveURL(new RegExp(`/projects/${fixture.project_id}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(projectName);

  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  const editProject = page.getByRole("dialog", { name: "Edit project", exact: true });
  await editProject.getByRole("textbox", { name: "Project name", exact: true }).fill(editedProjectName);
  await editProject.getByRole("textbox", { name: "Project tags", exact: true }).fill("browser-fixture, reviewed");
  await editProject.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(editProject).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(editedProjectName);
  expect((await (await request.get(`/api/v1/projects/${fixture.project_id}`)).json()).tags).toEqual(["browser-fixture", "reviewed"]);

  await page.goto(`/songs/new?project_id=${fixture.project_id}`);
  await page.getByRole("textbox", { name: "Song title", exact: true }).fill(songTitle);
  await page.getByRole("textbox", { name: "The idea", exact: true }).fill("A warm instrumental with a soft bass pulse and plenty of space.");
  await page.getByRole("textbox", { name: "Style / genre", exact: true }).fill("Warm soulful house");
  await page.getByRole("combobox", { name: "Vocals", exact: true }).click();
  await page.getByRole("option", { name: "Instrumental", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Target duration (seconds)", exact: true }).fill("90");
  await page.getByRole("spinbutton", { name: "Target BPM", exact: true }).fill("120");
  await page.getByRole("textbox", { name: "Musical key", exact: true }).fill("A minor");
  await page.getByRole("textbox", { name: "Song tags", exact: true }).fill("browser-fixture, original-tone");
  await page.getByRole("textbox", { name: "Notes & references", exact: true }).fill("An original test tone, never a commercial reference track.");
  const songResponse = page.waitForResponse((response) => response.url().endsWith(`/api/v1/projects/${fixture.project_id}/songs`) && response.request().method() === "POST");
  await page.getByRole("button", { name: "Create song", exact: true }).click();
  const savedSong = await songResponse;
  expect(savedSong.status()).toBe(201);
  fixture.song_id = (await savedSong.json()).id;
  await record();
  await expect(page).toHaveURL(new RegExp(`/songs/${fixture.song_id}$`));
  await page.getByRole("button", { name: "Edit song", exact: true }).click();
  const editSong = page.getByRole("dialog", { name: "Edit song", exact: true });
  const notes = "Keep the original source untouched.\nReturn after refresh and inspect its complete history.";
  await editSong.getByRole("textbox", { name: "Notes & references", exact: true }).fill(notes);
  await editSong.getByRole("spinbutton", { name: "Target BPM", exact: true }).fill("132");
  await editSong.getByRole("textbox", { name: "Musical key", exact: true }).fill("D minor");
  await editSong.getByRole("textbox", { name: "Song tags", exact: true }).fill("browser-fixture, edited");
  await editSong.getByRole("button", { name: "Save song", exact: true }).click();
  await expect(editSong).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(songTitle);
  const persistedSong = await (await request.get(`/api/v1/songs/${fixture.song_id}`)).json();
  expect(persistedSong).toMatchObject({ notes, bpm: 132, musical_key: "D minor", tags: ["browser-fixture", "edited"], style: "Warm soulful house", vocal_mode: "instrumental", target_duration_seconds: 90 });

  const fileInput = page.getByLabel("Upload audio", { exact: true });
  await fileInput.setInputFiles({ name: "invalid-audio.wav", mimeType: "audio/wav", buffer: Buffer.from("This is not an audio file.") });
  const invalidUpload = page.waitForResponse((response) => response.url().endsWith(`/api/v1/projects/${fixture.project_id}/assets/upload`) && response.request().method() === "POST");
  await page.locator("button[type=submit]").filter({ hasText: /^Upload audio$/ }).click();
  expect((await invalidUpload).status()).toBe(422);
  await expect(page.locator("form").filter({ has: fileInput }).getByRole("alert")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("invalid-upload.png"), fullPage: true, animations: "disabled" });
  await fileInput.setInputFiles({ name: filename, mimeType: "audio/wav", buffer: audioBytes });
  const uploadResponse = page.waitForResponse((response) => response.url().endsWith(`/api/v1/projects/${fixture.project_id}/assets/upload`) && response.request().method() === "POST");
  await page.locator("button[type=submit]").filter({ hasText: /^Upload audio$/ }).click();
  const uploaded = await uploadResponse;
  expect(uploaded.status()).toBe(201);
  const asset = await uploaded.json();
  fixture.asset_id = asset.id;
  await record();
  expect(asset).toMatchObject({ project_id: fixture.project_id, song_id: fixture.song_id, original_filename: filename, sha256, sample_rate: 22050, channels: 1 });
  expect(asset).not.toHaveProperty("storage_key");
  expect(asset).not.toHaveProperty("path");
  await expect(page.getByText("Audio uploaded. Your source is preserved.", { exact: true })).toBeVisible();
  const audio = page.getByLabel(`Listen to ${filename}`, { exact: true });
  await expect(audio).toBeVisible();
  await audio.evaluate(async (element) => { await (element as HTMLAudioElement).play(); });
  await expect.poll(() => audio.evaluate((element) => (element as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
  await audio.evaluate((element) => (element as HTMLAudioElement).pause());

  const ranged = await request.get(`/api/v1/assets/${fixture.asset_id}/stream`, { headers: { Range: "bytes=0-31" } });
  expect(ranged.status()).toBe(206);
  expect(ranged.headers()["content-range"]).toBe(`bytes 0-31/${audioBytes.length}`);
  expect((await ranged.body()).equals(audioBytes.subarray(0, 32))).toBe(true);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download audio", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(filename);
  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  expect(createHash("sha256").update(await readFile(downloadedPath!)).digest("hex")).toBe(sha256);
  expect(await (await request.get(`/api/v1/assets/${fixture.asset_id}/lineage`)).json()).toEqual({ items: [] });
  await page.getByRole("button", { name: "View history", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Asset history", exact: true });
  await expect(history.getByText("Original uploaded source. No transformations yet.", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(history).not.toBeVisible();
  await page.getByRole("button", { name: "AI Producer", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/producer\\?song_id=${fixture.song_id}$`));
  await page.reload();
  await page.getByRole("button", { name: songTitle, exact: true }).click();
  await page.getByRole("menuitem", { name: "Open current song", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/songs/${fixture.song_id}$`));

  for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`/songs/${fixture.song_id}`);
    await expect(page.getByLabel(`Listen to ${filename}`, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`song-${width}.png`), fullPage: true, animations: "disabled" });
  }
  await page.goto("/library");
  await expect(page.getByText(filename, { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("library-mobile.png"), fullPage: true, animations: "disabled" });
  await page.goto("/projects");
  await page.getByRole("textbox", { name: "Search projects", exact: true }).fill(editedProjectName);
  await page.getByRole("link", { name: editedProjectName, exact: true }).click();
  await page.getByRole("link", { name: songTitle, exact: true }).click();
  await expect(page.getByLabel(`Listen to ${filename}`, { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
  await testInfo.attach("retained-domain-fixture", { path: fixturePath, contentType: "application/json" });
});
