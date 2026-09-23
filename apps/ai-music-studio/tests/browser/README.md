# Browser verification

Start the Studio web/API/database and bootstrap a private test owner first. Set
`STUDIO_TEST_EMAIL` and `STUDIO_TEST_PASSWORD` through the runner's environment;
never put credentials in a command argument or committed file. These tests use the running
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

Set `STUDIO_TEST_BASE_URL` to override `http://localhost:3210`. It must match the
API's configured public origin. A global setup logs in once for shell tests,
writes an ignored session file with mode 0600 inside mode 0700 artifact directories,
revokes the session, and deletes the file after the suite. Failed server revocation
is reported. Auth/settings tests run after the shell projects to
avoid settings mutations racing screenshots. They disable traces and automatic
screenshots; login screenshots are captured only with an empty password field.
Each run covers 1440×900, 1280×800, 1024×768, and 390×844 viewports,
checks horizontal overflow, captures a full-page screenshot, checks runtime
errors, and verifies that a surfaced connection failure can recover by retrying.
The shell suite covers all twelve primary routes, navigation and the mobile
sheet, project/provider dialogs, Settings tabs, long song titles and vocal
selection, and navigation back from a missing page. It captures extra screenshots
for dialogs, populated forms, connection errors, and the missing-page state.
Screenshots and failure traces live in ignored `test-results/browser/`;
the HTML report lives in ignored `playwright-report/`.
