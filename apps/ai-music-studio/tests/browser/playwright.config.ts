import { defineConfig } from "@playwright/test";
import { authStatePath, baseURL } from "./auth-state";

const sizes = [
  { name: "desktop-wide", width: 1440, height: 900 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  globalSetup: "./auth.setup.ts",
  globalTeardown: "./auth.teardown.ts",
  outputDir: "../../test-results/browser",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "../../playwright-report", open: "never" }]],
  use: {
    channel: "chromium",
    baseURL,
    storageState: authStatePath,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [...sizes.map(({ name, width, height }) => ({
    name,
    testIgnore: "auth.spec.ts",
    use: { browserName: "chromium", viewport: { width, height } },
  })), {
    name: "auth-settings",
    testMatch: "auth.spec.ts",
    dependencies: sizes.map(({ name }) => name),
    use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
  }],
});
