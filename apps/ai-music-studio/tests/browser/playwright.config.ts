import { defineConfig } from "@playwright/test";

const sizes = [
  { name: "desktop-wide", width: 1440, height: 900 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: "../../test-results/browser",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "../../playwright-report", open: "never" }]],
  use: {
    channel: "chromium",
    baseURL: process.env.STUDIO_TEST_BASE_URL ?? "http://127.0.0.1:3210",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: sizes.map(({ name, width, height }) => ({
    name,
    use: { browserName: "chromium", viewport: { width, height } },
  })),
});
