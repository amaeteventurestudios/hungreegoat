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
  const credentials = { email: `missing-owner-${crypto.randomUUID()}@studio.local`, password: "incorrect-password-never-real-123!" };
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

test.describe("provider configuration", () => {
  test.use({ storageState: authStatePath });

  test("provider metadata stays private and missing credentials produce a normalized health error", async ({ request, playwright }) => {
    const anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    try {
      expect((await anonymous.get("/api/v1/settings/providers")).status()).toBe(401);
    } finally {
      await anonymous.dispose();
    }
    const list = await request.get("/api/v1/settings/providers");
    expect(list.status()).toBe(200);
    const { items } = await list.json();
    expect(items.map((item: { provider: string }) => item.provider).sort()).toEqual(["anthropic", "elevenlabs", "openai", "openrouter"]);
    const provider = items.find((item: { provider: string }) => item.provider === "openai");
    expect(provider.credential_present, "Provider lifecycle tests require an empty OpenAI integration.").toBe(false);
    expect(provider).not.toHaveProperty("secret_reference");
    const session = await (await request.get("/api/v1/auth/session")).json();
    const health = await request.post("/api/v1/settings/providers/openai/health-check", {
      headers: { Origin: baseURL, "X-CSRF-Token": session.csrf_token },
    });
    expect(health.status()).toBe(409);
    expect(await health.json()).toMatchObject({ error: { code: "provider_not_configured" } });
    const models = await request.get("/api/v1/settings/providers/openai/models");
    expect(models.status()).toBe(200);
    expect(await models.json()).toMatchObject({ source: "catalog" });
  });

  test("provider credentials rotate safely and settings persist across refresh", async ({ page, request }, testInfo) => {
    const endpoint = "/api/v1/settings/providers/openai";
    const originalSettings = await (await request.get("/api/v1/settings")).json();
    const originalItems = (await (await request.get("/api/v1/settings/providers")).json()).items;
    const original = originalItems.find((item: { provider: string }) => item.provider === "openai");
    expect(original.credential_present, "Refusing to replace an existing provider credential.").toBe(false);
    const session = await (await request.get("/api/v1/auth/session")).json();
    const headers = { Origin: baseURL, "X-CSRF-Token": session.csrf_token };
    const catalog = await (await request.get(`${endpoint}/models`)).json();
    expect(catalog.items.length).toBeGreaterThan(0);
    // Preserve the real credential-less catalog; never send a nonreal key upstream.
    await page.route(`**${endpoint}/models`, (route) => route.fulfill({ json: catalog }));
    const marker = crypto.randomUUID();
    const firstKey = `studio-nonreal-e2e-${marker}-A111`;
    const secondKey = `studio-nonreal-e2e-${marker}-B222`;
    const hasKey = (value: string) => value.includes(firstKey) || value.includes(secondKey);
    const card = page.locator('[aria-label="OpenAI integration"]');
    async function storeKey(action: "Add" | "Replace", key: string) {
      await page.getByRole("button", { name: `${action} OpenAI API key`, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: `${action} OpenAI API key`, exact: true });
      const input = dialog.getByLabel("API key", { exact: true });
      expect((await input.inputValue()) === "").toBe(true);
      await input.evaluate((element, value) => {
        const input = element as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, key);
      const responsePromise = page.waitForResponse((response) => response.url().endsWith(`${endpoint}/credential`) && response.request().method() === "PUT");
      await dialog.getByRole("button", { name: "Save key", exact: true }).click();
      const response = await responsePromise;
      expect(response.status()).toBe(200);
      expect(hasKey(await response.text())).toBe(false);
      await expect(dialog).not.toBeVisible();
    }
    try {
      await page.goto("/settings");
      await expect(card.getByRole("button", { name: "Test connection", exact: true })).toBeDisabled();
      await expect(card.getByRole("switch", { name: "Provider enabled" })).toBeDisabled();
      await page.getByRole("button", { name: "Add OpenAI API key", exact: true }).click();
      const draftDialog = page.getByRole("dialog", { name: "Add OpenAI API key", exact: true });
      await draftDialog.getByLabel("API key", { exact: true }).evaluate((element, value) => {
        (element as HTMLInputElement).value = value;
      }, firstKey);
      await draftDialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await storeKey("Add", firstKey);
      await expect(card.getByText("••••A111", { exact: true })).toBeVisible();
      await card.getByRole("switch", { name: "Provider enabled" }).click();
      await expect(card.getByRole("switch", { name: "Provider enabled" })).toBeChecked();
      await card.getByRole("button", { name: "Load models", exact: true }).click();
      await card.getByRole("combobox", { name: "Default model", exact: true }).click();
      await page.getByRole("option", { name: catalog.items[0].label, exact: true }).click();
      await expect(card.getByRole("status")).toContainText("Default model saved.");
      await page.getByRole("combobox", { name: "Default AI producer", exact: true }).click();
      await page.getByRole("option", { name: "OpenAI", exact: true }).click();
      await page.getByRole("button", { name: "Save provider defaults", exact: true }).click();
      await expect(page.getByText("Provider defaults saved.", { exact: true })).toBeVisible();
      await page.reload();
      await expect(card.getByText("••••A111", { exact: true })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "Default AI producer", exact: true })).toContainText("OpenAI");
      const persisted = (await (await request.get("/api/v1/settings/providers")).json()).items.find((item: { provider: string }) => item.provider === "openai");
      expect(persisted.default_model).toBe(catalog.items[0].id);
      await storeKey("Replace", secondKey);
      await expect(card.getByText("••••B222", { exact: true })).toBeVisible();
      await expect(card.getByText("••••A111", { exact: true })).toHaveCount(0);
      await card.getByRole("switch", { name: "Provider enabled" }).click();
      await expect(card.getByRole("switch", { name: "Provider enabled" })).not.toBeChecked();
      await expect(page.getByRole("combobox", { name: "Default AI producer", exact: true })).toContainText("Not selected");
      await page.reload();
      await expect(card.getByRole("switch", { name: "Provider enabled" })).not.toBeChecked();
      await card.getByRole("switch", { name: "Provider enabled" }).click();
      await expect(card.getByRole("switch", { name: "Provider enabled" })).toBeChecked();
      await page.getByRole("combobox", { name: "Default AI producer", exact: true }).click();
      await page.getByRole("option", { name: "OpenAI", exact: true }).click();
      await page.getByRole("button", { name: "Save provider defaults", exact: true }).click();
      await expect(page.getByText("Provider defaults saved.", { exact: true })).toBeVisible();
      const browserValues = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, html: document.body.innerHTML }));
      expect(hasKey(browserValues)).toBe(false);
      expect(hasKey(await (await request.get("/api/v1/settings/providers")).text())).toBe(false);
      for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768], [390, 844]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => window.scrollTo(0, 0));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`provider-cards-${width}.png`), fullPage: true, animations: "disabled" });
      }
      await page.getByRole("button", { name: "Delete OpenAI API key", exact: true }).click();
      const deleteDialog = page.getByRole("dialog", { name: "Delete OpenAI API key?", exact: true });
      await deleteDialog.getByRole("button", { name: "Delete key", exact: true }).click();
      await expect(deleteDialog).not.toBeVisible();
      await expect(page.getByRole("button", { name: "Add OpenAI API key", exact: true })).toBeVisible();
      await expect(page.getByRole("combobox", { name: "Default AI producer", exact: true })).toContainText("Not selected");
      await page.reload();
      await expect(card.getByRole("switch", { name: "Provider enabled" })).toBeDisabled();
      const removed = (await (await request.get("/api/v1/settings/providers")).json()).items.find((item: { provider: string }) => item.provider === "openai");
      expect(removed).toMatchObject({ credential_present: false, enabled: false, masked_secret: null });
    } finally {
      expect((await request.delete(`${endpoint}/credential`, { headers })).ok()).toBe(true);
      expect((await request.patch(endpoint, { headers, data: { enabled: original.enabled, default_model: original.default_model } })).ok()).toBe(true);
      expect((await request.patch("/api/v1/settings", { headers, data: originalSettings })).ok()).toBe(true);
    }
  });
});
