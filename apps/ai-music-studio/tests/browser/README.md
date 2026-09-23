# Browser verification

Start the Studio web/API/database first. These tests deliberately use the running
services so a mocked health response cannot hide a broken same-origin API proxy.

From the Studio root:

```sh
npx playwright install chromium
npx playwright test --config tests/browser/playwright.config.ts
```

On Ubuntu 26.04, Playwright 1.55.1 does not recognize the host release. Use its
Ubuntu 24.04 browser build with
`PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx playwright install chromium`.
The same environment variable can be used when running tests. This installs only
the user-local browser cache; it does not change system packages.

Set `STUDIO_TEST_BASE_URL` to override `http://127.0.0.1:3210`.
Each run covers 1440×900, 1280×800, 1024×768, and 390×844 viewports,
checks horizontal overflow, captures a full-page screenshot, checks runtime
errors, and verifies that a surfaced connection failure can recover by retrying.
Screenshots and failure traces live in ignored `test-results/browser/`;
the HTML report lives in ignored `playwright-report/`.
