# Local Studio development

Run from `apps/ai-music-studio`:

```sh
python3 scripts/bootstrap.py
bash scripts/compose.sh config --quiet
bash scripts/compose.sh up -d --build
curl --fail http://127.0.0.1:8310/api/v1/health/ready
curl --fail http://127.0.0.1:3210/api/v1/health/ready
```

Open http://localhost:3210. The wrapper always selects the Studio Compose file
and private `.env`. Bootstrap generates a random database password with mode 0600
and assets outside source under `~/.local/share/hg-studio/dev/assets`. It preserves
existing configuration. Check local listener availability before overriding ports.
Database ports are not published. The API runs as the configured host UID/GID to
write its private bind-mounted assets; PostgreSQL uses a project-scoped volume.
Migrations run as a one-shot service before API startup.

```sh
bash scripts/compose.sh ps
bash scripts/compose.sh logs --tail 50 studio-api
npm ci
npm run typecheck
npm run build
npx playwright test --config tests/browser/playwright.config.ts
```

API setup and lint are documented in `apps/api/README.md`. After setting up its
`.venv`, run `python3 scripts/test-api.py` from Studio: it creates a uniquely named
test database in the development cluster, runs all API checks, and drops only
that test database in a finally block. It refuses non-development configuration. Browser tests use the running Studio stack; install Chromium
with `npx playwright install chromium` if absent. No paid provider is required
for foundation checks.

For shutdown use `bash scripts/compose.sh stop`. Never use Docker system prune,
remove unrelated containers, or pass `down -v` against valuable Studio data.
This development setup is not the public production deployment.
