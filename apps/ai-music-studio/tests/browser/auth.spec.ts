import { expect, test } from "@playwright/test";
import { authStatePath, baseURL, ownerCredentials } from "./auth-state";

test.describe.configure({ mode: "default" });
test.use({ storageState: { cookies: [], origins: [] }, trace: "off", screenshot: "off" });

test("anonymous visitors cannot read workspace settings or enter the workspace", async ({ page, request }) => {
  const session = await request.get("/api/v1/auth/session");
  expect(session.status()).toBe(200);
  expect(await session.json()).toMatchObject({ authenticated: false });
  expect(session.headers()["cache-control"]).toContain("no-store");
  const settings = await request.get("/api/v1/settings");
  expect(settings.status()).toBe(401);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
});

test("invalid credentials remain anonymous and foreign origins cannot log in", async ({ request }) => {
  const credentials = { email: "missing-owner@studio.local", password: "incorrect-password-never-real-123!" };
  const invalid = await request.post("/api/v1/auth/login", { data: credentials, headers: { Origin: baseURL } });
  expect(invalid.status()).toBe(401);
  const payload = await invalid.text();
  expect(payload).not.toContain(credentials.email);
  expect(payload).not.toContain(credentials.password);
  const foreign = await request.post("/api/v1/auth/login", { data: credentials, headers: { Origin: "https://foreign.invalid" } });
  expect(foreign.status()).toBe(403);
  expect(await (await request.get("/api/v1/auth/session")).json()).toMatchObject({ authenticated: false });
});

test("sign in, refresh, and sign out work at every supported viewport", async ({ page, context }, testInfo) => {
  const credentials = ownerCredentials();
  for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    await page.screenshot({ path: testInfo.outputPath(`login-${width}.png`), fullPage: true });
    await page.getByRole("textbox", { name: "Email", exact: true }).fill(credentials.email);
    // Avoid a Playwright fill step containing the credential in its report title.
    await page.evaluate((password) => {
      const input = document.querySelector<HTMLInputElement>('input[name="password"]');
      if (!input) throw new Error("Password field is missing.");
      input.value = password;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, credentials.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const cookie = (await context.cookies()).find((item) => item.name.endsWith("studio_session"));
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.path).toBe("/");
    expect(await page.evaluate(() => document.cookie)).not.toContain("studio_session");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await (await page.request.get("/api/v1/auth/session")).json()).toMatchObject({ authenticated: true });
    await page.getByRole("button", { name: "No song selected", exact: true }).click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    expect(await (await page.request.get("/api/v1/auth/session")).json()).toMatchObject({ authenticated: false });
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
  }
});

test.describe("persisted workspace settings", () => {
  test.use({ storageState: authStatePath });

  test("workspace name and dark appearance survive refresh at every viewport", async ({ page, request }, testInfo) => {
    const original = await (await request.get("/api/v1/settings")).json();
    const session = await (await request.get("/api/v1/auth/session")).json();
    try {
      await page.goto("/settings");
      await page.getByRole("tab", { name: "Workspace", exact: true }).click();
      await page.getByRole("textbox", { name: "Workspace name", exact: true }).fill("Browser verification studio");
      await page.getByRole("button", { name: "Save settings", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("Settings saved.");
      await page.reload();
      await page.getByRole("tab", { name: "Workspace", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Workspace name", exact: true })).toHaveValue("Browser verification studio");
      expect((await (await request.get("/api/v1/settings")).json()).workspace.name).toBe("Browser verification studio");

      await page.getByRole("tab", { name: "Appearance", exact: true }).click();
      await page.getByRole("combobox", { name: "Theme", exact: true }).click();
      await page.getByRole("option", { name: "Dark", exact: true }).click();
      await page.getByRole("button", { name: "Save settings", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("Settings saved.");
      await page.reload();
      await expect(page.locator("html")).toHaveClass(/dark/);
      for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768], [390, 844]]) {
        await page.setViewportSize({ width, height });
        await page.getByRole("tab", { name: "Appearance", exact: true }).click();
        await expect(page.getByRole("combobox", { name: "Theme", exact: true })).toContainText("Dark");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: testInfo.outputPath(`appearance-dark-${width}.png`), fullPage: true, animations: "disabled" });
      }
    } finally {
      const restore = await request.patch("/api/v1/settings", { data: original, headers: { Origin: baseURL, "X-CSRF-Token": session.csrf_token } });
      expect(restore.status()).toBe(200);
    }
  });
});

test("authenticated settings reject missing CSRF and foreign origins", async ({ playwright }) => {
  const request = await playwright.request.newContext({ baseURL, storageState: authStatePath });
  try {
    const session = await (await request.get("/api/v1/auth/session")).json();
    const payload = { workspace: { name: "This must never be saved" } };
    const withoutToken = await request.patch("/api/v1/settings", { data: payload, headers: { Origin: baseURL } });
    expect(withoutToken.status()).toBe(403);
    const foreignOrigin = await request.patch("/api/v1/settings", { data: payload, headers: { Origin: "https://foreign.invalid", "X-CSRF-Token": session.csrf_token } });
    expect(foreignOrigin.status()).toBe(403);
    const settings = await request.get("/api/v1/settings");
    expect(settings.status()).toBe(200);
    expect(settings.headers()["cache-control"]).toContain("no-store");
    expect((await settings.json()).workspace.name).not.toBe(payload.workspace.name);
  } finally {
    await request.dispose();
  }
});
