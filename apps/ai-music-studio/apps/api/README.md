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
