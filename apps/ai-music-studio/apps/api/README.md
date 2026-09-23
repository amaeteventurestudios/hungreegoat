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
Provider configuration is implemented in the following phase.

`GET /settings/system` reports tool availability in the API runtime; it does not
claim a remote worker or audio engine has executed successfully. Storage reports
filesystem totals only and never exposes server paths.
