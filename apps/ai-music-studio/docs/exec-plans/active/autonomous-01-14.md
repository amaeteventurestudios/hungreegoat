# Autonomous execution — Phases 01–14

Status: Active (2026-09-23)

## Scope and ordering
Follow `PHASES.md` and the matching newly named phase documents. Older numbered
documents remain supplemental requirements, not a second phase sequence.
Phase 00 is complete. Execute 01 foundation, 02 shell, 03 authentication/settings,
04 secrets/providers, 05 domain, 06 orchestration, 07 producer, 08 generation,
09 listening, 10 arrangement, 11 tempo, 12 stems, 13 mastering/export, 14 launch.
Each checkpoint requires actual verification, fixes, documentation, and a scoped
commit where appropriate, immediately followed by the next phase.

## Affected paths and ownership
All source changes stay under Studio. Coordinator owns infrastructure, integration,
phase records, acceptance, and commits. Independent agents initially own
`apps/api/` and `apps/web/` plus `packages/` respectively. Shared interfaces and
migrations are serialized. Read-only deployment discovery runs independently.

## Non-goals / Cross-App Impact
No sibling application edits, root workspace changes, broadcast restarts, or
replacement of existing gateway behavior. A later production routing addition
must name its exact configuration impact before implementation.

## Baseline
Existing modified Control file and four untracked root docs/images are preserved.
Outside-Studio SHA-256 snapshot: `/tmp/studio-autonomous-baseline.json`.
Existing Docker container snapshot: `/tmp/studio-container-baseline.json`.
Host has Node 26.8.1, Python 3.14.4, Docker 29.8.0, Compose 5.5.1, FFmpeg.
Use containerized stable runtimes for reproducibility. Ports 3210 and 8310 are
free at initial inspection; 3100 and broadcast 8100 are occupied.

## Data/model impact
Alembic migrations own all schema changes. PostgreSQL stores canonical state;
Windmill owns execution. Immutable assets reside outside source. Session tokens
are hashed; provider secrets require separate protected storage and references.

## Test strategy
Unit/API/workflow tests, real PostgreSQL migrations and restart persistence,
provider contract fixtures plus live minimal checks when credentials exist,
real local audio engines on generated safe fixtures, browser E2E and screenshots
at 1440×900, 1280×800, 1024×768 and 390px. Verify source preservation, secret
redaction, authorization, job recovery, backups/restore and production health.

## Deployment and rollback
Use separate `hg-studio-*` Compose projects, loopback bindings, project-scoped
volumes, CPU/memory limits, no broadcast network. Roll back only Studio image/config
revisions; retain data and immutable outputs. Never run broad cleanup/prune/reset.
Production deployment will be attempted after hardening, with existing service
health checked before and after. External blockers are recorded without stopping
independent work.

## Checkpoints
- 01: Verified — healthy Compose web/API/PostgreSQL, Alembic head, 7 API tests,
  lint/typecheck/build, 8 browser checks with four viewport screenshots, external
  assets writable as non-root, 293 protected-file hashes unchanged and all nine
  original containers still running. Existing public surfaces return HTTP 200.
- 02: In progress — complete responsive product shell.
- 03–14: Pending dependency-ready checkpoints.

## Research
- Compose project isolation: https://docs.docker.com/compose/how-tos/project-name/
- Health-dependent startup: https://docs.docker.com/compose/how-tos/startup-order/
- PostgreSQL support policy: https://www.postgresql.org/support/versioning/

## Results
Append real command outcomes and checkpoint evidence as work progresses.

### Phase 01 commands and evidence
- `python3 scripts/bootstrap.py`; `bash scripts/compose.sh config --quiet`: pass.
- API image build, Compose up; web image build and Compose up: pass.
- API agent: `uv run pytest` with disposable PostgreSQL URL: 7 passed; ruff clean.
- `npm run build`, `npm run typecheck`, `npm audit --omit=dev`: pass, zero vulnerabilities.
- `npx playwright test --config tests/browser/playwright.config.ts`: 8 passed,
  screenshots inspected at all four required sizes, error/retry recovery verified.
- `curl` direct API and web proxy readiness: both 200 with database ok.
- `alembic current` = 0001_foundation; `alembic check`: no new operations.
- Non-root API asset create/remove check passed.
- `python3 scripts/check-boundary.py`: 293 original files preserved.
- Existing Home/Player/Control/DJ/broadcast public HTTP checks: all 200.
- Initial attempt to exec the completed migration service reported not running,
  as expected for a one-shot service; checked Alembic through running API instead.
- Chromium install workaround: official downloaded archive extracted into user
  cache when Node26 installer stalled; no system browser/library changes.
