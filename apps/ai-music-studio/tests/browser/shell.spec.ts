import { expect, test } from "@playwright/test";

const routes = [
  "/", "/projects", "/songs/new", "/producer", "/generation", "/compare",
  "/arrangement", "/tempo", "/stems", "/mastering", "/library", "/settings",
];

for (const route of routes) {
  test(`Studio route ${route} renders without clipping or runtime errors`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(geometry.content).toBeLessThanOrEqual(geometry.viewport);
    const tabList = page.getByRole("tablist");
    if (await tabList.count()) {
      const tabsBox = await tabList.boundingBox();
      const panelBox = await page.getByRole("tabpanel").boundingBox();
      expect(tabsBox).not.toBeNull();
      expect(panelBox).not.toBeNull();
      expect(panelBox!.y).toBeGreaterThanOrEqual(tabsBox!.y + tabsBox!.height - 1);
      expect(panelBox!.width).toBeGreaterThan(250);
      for (const tab of await tabList.getByRole("tab").all()) {
        const tabBox = await tab.boundingBox();
        expect(tabBox).not.toBeNull();
        expect(tabBox!.y + tabBox!.height).toBeLessThanOrEqual(tabsBox!.y + tabsBox!.height + 1);
      }
    }
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("route.png"), fullPage: true });
  });
}

test("navigation opens, follows a route, and closes the mobile sheet", async ({ page, viewport }, testInfo) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Studio navigation" });
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  if ((viewport?.width ?? 1440) < 768) {
    await expect(navigation).not.toBeVisible();
    await toggle.click();
    await expect(navigation).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("navigation-sheet.png"), fullPage: false, animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(navigation).not.toBeVisible();
    await expect(toggle).toBeFocused();
    await toggle.click();
  }
  await navigation.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  if ((viewport?.width ?? 1440) < 768) {
    await expect(navigation).not.toBeVisible();
  } else {
    await expect(navigation.getByRole("link", { name: "Projects", exact: true })).toHaveAttribute("aria-current", "page");
  }
});

test("project selector routes to new song", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "No song selected" }).click();
  await page.getByRole("menuitem", { name: "Start a new song" }).click();
  await expect(page).toHaveURL(/\/songs\/new$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("project dialog fits the viewport and restores focus", async ({ page, viewport }, testInfo) => {
  await page.goto("/projects");
  const trigger = page.getByRole("button", { name: "New project", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Create a project" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  await page.screenshot({ path: testInfo.outputPath("project-dialog.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("settings tabs and provider dialog are accessible", async ({ page }, testInfo) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Add OpenAI API key", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add OpenAI API key" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("API key", { exact: true })).toHaveAttribute("type", "password");
  await expect(dialog.getByLabel("API key", { exact: true })).toHaveValue("");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("tab", { name: "Health", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Health", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Studio connected", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("settings-health.png"), fullPage: true });
});

test("new song requires a project and supports a detailed musical brief", async ({ page, request }, testInfo) => {
  await page.goto("/songs/new");
  const projects = (await (await request.get("/api/v1/projects")).json()).items;
  if (!projects.length) {
    await expect(page.getByText("Create a project first to give this song a home.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create a project", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("song-project-prerequisite.png"), fullPage: true });
    return;
  }
  await page.getByRole("combobox", { name: "Project", exact: true }).click();
  await page.getByRole("option", { name: projects[0].name, exact: true }).first().click();
  const title = "A long working title for a late-night instrumental that leaves room for a brighter chorus and a final quiet moment";
  await page.getByRole("textbox", { name: "Song title", exact: true }).fill(title);
  const brief = "Warm bass, soft percussion, a gradual lift into a bright chorus, with vocals.";
  await page.getByRole("textbox", { name: "The idea", exact: true }).fill(brief);
  await page.getByRole("spinbutton", { name: "Target BPM" }).fill("124");
  await page.getByRole("combobox", { name: "Vocals", exact: true }).click();
  await page.getByRole("option", { name: "With vocals", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Vocals", exact: true })).toContainText("With vocals");
  await expect(page.getByRole("textbox", { name: "The idea", exact: true })).toHaveValue(brief);
  await expect(page.getByRole("textbox", { name: "Song title", exact: true })).toHaveValue(title);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("song-brief.png"), fullPage: true });
});

test("missing page offers a working route back to the dashboard", async ({ page }, testInfo) => {
  await page.goto("/missing-studio-page");
  await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("not-found.png"), fullPage: true });
  await page.getByRole("button", { name: "Back to dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});
