# Studio API

Python 3.12+, FastAPI, SQLAlchemy 2, psycopg 3, Alembic. `uv.lock` locks development
and runtime dependencies; `requirements.txt` exports hashed runtime dependencies
for the Python 3.12 image. No dependency is installed into the monorepo root.

From this directory:

```sh
uv sync --locked --python 3.12
uv run pytest
uv run ruff check .
uv run alembic upgrade head
uv run uvicorn studio_api.main:create_app --factory --host 127.0.0.1 --port 8310 --no-access-log
```

Required environment: `STUDIO_DATABASE_URL` (PostgreSQL URL) and
`STUDIO_ASSET_ROOT` (absolute persistent asset path). Optional: `STUDIO_ENV`
(`development`, `test`, `production`), `STUDIO_LOG_LEVEL` and
`STUDIO_DATABASE_CONNECT_TIMEOUT` (seconds, default 3). Secret values are masked
in configuration representations. Database connections are opened lazily and
closed at application shutdown. Migrations run explicitly, never from requests.

`GET /api/v1/health/live` checks the process. `GET /api/v1/health/ready` checks
PostgreSQL connectivity and the migration table, returning 503 on failure.
The API generates a request ID for each request and returns it as `X-Request-ID`.
Studio application/request logs are JSON and exclude query strings, request
bodies, credentials and database exception text. Uvicorn access logs are disabled
by the image command. Interactive API docs are disabled in production.

To run the migration integration test, set `STUDIO_TEST_DATABASE_URL` to a
**disposable Studio test database**. This test runs migration upgrade, metadata
comparison, downgrade and upgrade; never point it at production.

The image build context is this directory. Its internal port is 8000 and its
working directory is `/app`, where `alembic upgrade head` works. The process runs
as UID 10001. The deployment owns persistent-directory creation and permissions.

Upstream references used for foundation decisions:
- https://fastapi.tiangolo.com/advanced/events/
- https://docs.sqlalchemy.org/en/20/dialects/postgresql.html


## Private owner and settings

Run `alembic upgrade head`, then provision the first owner:

```sh
python -m studio_api.bootstrap --email owner@example.com \
  --display-name Owner --workspace-name "My studio" \
  --password-file /run/secrets/studio-owner-password
```

The password file must be a regular file without group/other permissions (0600).
Omit `--password-file` to read stdin. Passwords require 12–128 characters. Bootstrap
is transaction-locked and refuses to replace an existing owner. No public signup
exists. The CLI never prints passwords.

Set `STUDIO_PUBLIC_URL` to the exact browser origin (development default
`http://localhost:3210`). Production requires HTTPS; development HTTP requires
loopback. `STUDIO_SESSION_LIFETIME_SECONDS` defaults to 43200 (12 hours).

The auth and settings routes follow `docs/AUTH_SETTINGS_CONTRACT.md`. Login
throttling persists in PostgreSQL: five failed attempts per normalized email per
15-minute window, plus 20 failed attempts per actual peer address (the private
web proxy), without trusting forwarded IP headers. Argon2 hashing concurrency is
bounded to two operations per process. Request bodies are limited to 1 MiB before
JSON validation. Session cookie tokens are random and hashed in PostgreSQL.
Authenticated writes require the session CSRF token and all unsafe browser calls
require the configured Origin. Password changes revoke all sessions atomically.
The active session workspace must still have a valid membership on every call.

`GET /settings/system` reports tool availability in the API runtime; it does not
claim a remote worker or audio engine has executed successfully. Storage reports
filesystem totals only and never exposes server paths.

## Provider configuration and encrypted credentials

Set `STUDIO_SECRET_ROOT` to a private directory (0700) and
`STUDIO_SECRET_KEY_FILE` to a separate Fernet key file (0600), both outside source
and asset storage. Paths and their ancestors must not be symlinks. The key file
must be outside the encrypted-value directory. Provision a key with
`cryptography.fernet.Fernet.generate_key()` without printing it to logs. Back up
both the key and encrypted values through the private backup process. Losing the
key makes existing credentials unreadable. Never silently regenerate it.

The API stores UUID secret references and a last-four-character hint in
PostgreSQL; Fernet authenticated ciphertext lives in 0600 files. Rotation writes
and fsyncs a new file atomically, commits its database reference, then removes the
retired file. Failed database commits remove the new file. Cleanup failures return
an explicit repair error and emit a sanitized log. Deletion disables the provider,
clears its default-provider selection, and removes the ciphertext. No public API
returns raw credentials or secret references.

Settings provider APIs follow `docs/AUTH_SETTINGS_CONTRACT.md`. Health checks are
read-only provider calls, not billable generation tests, and cannot prove music or
structured-generation entitlement. Requests use fixed HTTPS endpoints, bounded
timeouts and response sizes, no redirects, no environment proxy inheritance, and
normalized errors. Quota values are only shown when exposed: OpenRouter key
spending limit and ElevenLabs subscription characters (not music quota).

Model lists use live provider APIs with a clearly labeled catalog fallback. The
ElevenLabs music catalog is documented separately from its speech-model list.
No model or provider is automatically selected or enabled. A configured, enabled
provider is required before it can become the workspace default.

Optional explicit import for deployments that already have environment keys:

```sh
python -m studio_api.provider_bootstrap --workspace-id WORKSPACE_UUID
```

This reads `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY` and
`ELEVENLABS_API_KEY` only when invoked. Existing dashboard credentials are retained.
It never prints credentials, does not enable providers, and does not call providers.

Verified upstream references (2026-09-23):
- https://developers.openai.com/api/reference/resources/models/methods/list
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://platform.claude.com/docs/en/api/models/list
- https://platform.claude.com/docs/en/models/overview
- https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key
- https://openrouter.ai/api/v1/models
- https://elevenlabs.io/docs/api-reference/user/subscription/get
- https://elevenlabs.io/docs/api-reference/music/compose-detailed
