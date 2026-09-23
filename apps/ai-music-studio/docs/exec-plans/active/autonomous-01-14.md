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
- 02: Verified — 12 routes, shared UI, responsive shell; lint/build/typecheck and
  80 browser checks pass. Visual defects fixed and screenshots inspected.
- 03: In progress — authentication, private workspace, persisted settings.
- 04–14: Pending dependency-ready checkpoints.

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

### Provider research preparation
Official structured-output docs reviewed for the eventual server-side producer
adapters (no paid calls made):
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://openrouter.ai/docs/guides/features/structured-outputs
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- https://elevenlabs.io/docs/api-reference/music/compose-detailed
No provider API credentials are present in the current process environment.
Provider Settings will provide credential entry without source edits; fixture
verification must stay visibly separate from real provider integration evidence.

### Phase 02 scope and acceptance
Extend shared shadcn/Base UI primitives and create Dashboard, Projects, New Song,
Producer, Generation, Compare, Arrangement, Tempo, Stems, Mastering, Library and
Settings routes. Domain-dependent actions show explicit prerequisite states;
no generated music or provider connection is fabricated. Shared responsive sidebar,
mobile sheet, workspace/song context, loading skeletons and error recovery are
verified with real Chromium. Settings initially presents provider/engine/storage/
audio/export/workspace/appearance categories; persistence follows in Phase 03/04.
Source ownership remains web/packages agent; browser suite remains audit agent.
Coordinator adds reusable isolated API checks and locked dependency inventory.

### Windmill preparation (read-only)
Pinned upstream candidate: v1.817.0. Its versioned LICENSE distinguishes the
AGPL source from the published binary's additional terms. Prefer a minimal
source build with Python execution and without proprietary features; compile
and runtime verification are still pending Phase 06. Avoid the upstream full
frontend/DuckDB build on this shared 12GB host. Use bounded Cargo concurrency.
Sources: https://github.com/windmill-labs/windmill/blob/v1.817.0/LICENSE and
https://github.com/windmill-labs/windmill/blob/v1.817.0/backend/Cargo.toml .
Planned execution: workers run packaged Python handlers; API handles only bounded
claim/progress/finalize operations. Persist execution IDs before dispatch and
reconcile ambiguous submission/recovery; never execute audio inside API requests.

### Phase 02 QA findings and repairs
Browser/visual review caught actual shared-component defects: dropdown label lacked
its required group; Select needed an items-to-label mapping; Tabs registry variants
did not match Base UI orientation attributes; wrapped Settings tabs inherited a
fixed height; Library empty table copy inherited nowrap. Fixes and regression
geometry assertions are applied before acceptance. A 404 test initially assumed
an anchor role instead of Base UI's button role; its locator was corrected.
Real loading skeleton timing was not captured on instantaneous static routes;
only the loading component source and health-check pending/recovery path are
claimed here. No test-only production routes were introduced.

### Phase 02 acceptance
`npm run build`, `npm run typecheck`, `npm run lint`, `git diff --check`: pass.
Rebuilt Studio web image and deployed only Studio web with `up -d --no-deps`.
Final `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx playwright test
--config tests/browser/playwright.config.ts`: 80 passed in 32.5s. Desktop, tablet,
mobile routes, focus/dialog/sheet behavior, retry, empty states and corrected
Settings/Library layouts visually inspected. Boundary check still preserves all
293 original outside-Studio files. Reusable API runner: 7 passed against a
created-and-removed isolated test database. Phase 03 proceeds immediately using
`docs/AUTH_SETTINGS_CONTRACT.md`; no public registration or hardcoded password.
