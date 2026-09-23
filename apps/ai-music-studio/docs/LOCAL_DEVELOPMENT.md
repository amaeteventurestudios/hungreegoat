# Local Studio development

Run from `apps/ai-music-studio`:

```sh
python3 scripts/bootstrap.py
python3 scripts/bootstrap-secrets.py
bash scripts/compose.sh config --quiet
bash scripts/compose.sh up -d --build
curl --fail http://127.0.0.1:8310/api/v1/health/ready
curl --fail http://127.0.0.1:3210/api/v1/health/ready
```

On first startup, run `python3 scripts/provision-owner.py` after migrations. It
creates the local owner once and stores credentials in
`~/.local/share/hg-studio/dev/owner.json` (0600). Existing owners are never replaced.
Open http://localhost:3210 and sign in with that private credential. The wrapper always selects the Studio Compose file
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
python3 scripts/test-browser.py
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

`python3 scripts/check-recovery.py` verifies settings/session persistence by
restarting only the local Studio PostgreSQL and API, then restores its temporary
settings change. Run it outside an active browser test run.

Provider keys are managed through Settings → Integrations. Secret bootstrap
creates a private `~/.local/share/hg-studio/dev/secrets` directory with encrypted
values and a separate 0600 encryption key. Re-running it preserves the existing
key. Keep both the database references and this directory in protected backups;
losing the encryption key makes stored credentials unrecoverable. Raw keys are
accepted once and never returned by the API. Test Connection and Load Models are
explicit actions; saving a credential does not start generation or a paid call.

Create a project in Projects, then create a song with its production brief. Song
details preserve notes, tags, style and target audio settings. Upload an original
audio file there or browse existing audio in Library. Uploads are limited to
100 MiB and one hour, validated by FFprobe, and stored as immutable private
objects. Playback and downloads require the workspace session. The browser
restores the selected song when returning to a workstation tool.

After browser domain tests, their generated project/song/asset IDs are recorded
under ignored `test-results/domain-fixtures/` with mode 0600. Run
`python3 scripts/check-recovery.py --project-id UUID` against that fixture to
verify metadata and downloaded SHA256 before and after a Studio database/API
restart. Run outside active browser tests. The generated audio fixture is an
original quiet sine tone; it is not an AI generation or evidence of a provider call.
