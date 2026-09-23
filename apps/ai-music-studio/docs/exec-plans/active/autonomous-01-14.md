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
- 03: Verified — secure sessions/settings, 16 API tests, 85 browser tests, real
  PostgreSQL/API restart preserves session/workspace/settings.
- 04: Verified — encrypted credentials, provider configuration/health/model lists,
  25 API tests, 87 browser tests and four-viewport visual review pass.
- 05: Verified — projects/songs/immutable assets, 33 API tests, 89 browser tests,
  2 targeted post-polish checks and actual database/API recovery with audio SHA256.
- 06: Blocked only on normal-account Windmill runtime token — durable
  dispatch/attempts/workers are implemented and locally verified; the live gate
  must validate the scoped token before worker/dispatcher startup.
- 07–14: Pending the Phase 06 live orchestration dependency.

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

### Phase 03 implementation plan
API owner implements migration 0002, Argon2 owner bootstrap, session/membership
checks, Origin and CSRF controls, throttling, typed settings, normalized errors,
and real PostgreSQL tests. Web owner implements login/session state, fixed-origin
same-origin proxy, protected shell and persisted settings. Browser owner extends
real service tests with isolated login/logout and serialized settings mutations.
Coordinator owns Compose public-origin configuration and private owner/browser
runner scripts. Bootstrap credentials are generated outside Git at mode 0600;
no public registration and no existing owner replacement. Development browser
origin is exactly http://localhost:3210. Provider credential operations remain
Phase 04, with no key collection before secure storage exists.

### Phase 03 acceptance
`python3 scripts/test-api.py`: 16 passed against disposable PostgreSQL. Ruff,
web build/lint/typecheck, diff/boundary checks pass. Migration 0002 applied;
`alembic check` reports no new operations. Private owner bootstrap succeeded.
`python3 scripts/test-browser.py`: 85 passed in 35.3s, login/logout/refresh at
all four sizes, auth boundaries and persisted settings/dark appearance verified.
Browser screenshots inspected; session artifact mode 0600 in mode 0700 directories,
revoked and deleted on teardown. `python3 scripts/check-recovery.py` restarted
only Studio PostgreSQL/API, confirmed persisted identity/settings, restored the
original preferences and revoked its temporary session. 293 protected-file hashes
remain unchanged. No provider keys were collected during this phase.

### Phase 04 implementation and review
Migration 0003 adds workspace provider configurations. Server-only SecretStore
encrypts private UUID files with Fernet; rotation/rollback/deletion and symlink
rejection are tested. Four provider adapters expose normalized read-only health,
quota and live/catalog model lists. Dashboard credentials are never returned.
UI supports add/replace/delete, enablement, health, model selection and defaults.
Review repaired stale cleared defaults, cancelled-key field lifetime, and a
component remount that discarded successful save feedback. Browser tests wait for
server-controlled switches rather than assuming synchronous state changes.

API: 25 tests passed with real disposable PostgreSQL and mocked provider HTTP;
Ruff and migration drift check passed. Local migration and new web/API images
deployed. Existing public service health checks remain HTTP 200. Keys are absent,
so actual paid provider invocation remains explicitly unverified and recorded in
HUMAN_BLOCKERS. Source catalogs link exact upstream references in API README.
Final browser gate: 87 passed in 40.4s; screenshots at all four viewports reviewed.
Test credential and provider/default changes were removed/restored. Browser model
requests replay a real catalog response to avoid sending fake keys to providers.

### Phase 05 implementation plan
Use docs/DOMAIN_CONTRACT.md for project/song/asset/job interfaces. API agent owns
relational migrations, workspace authorization, StorageProvider, bounded upload
and FFprobe validation, range streaming and API tests. Web agent owns real project
and song forms/details, asset library/upload/player and shared song selection.
Browser agent owns real persistence/upload/privacy regressions and visual QA.
Coordinator integrates images, restart checks, boundary protection and checkpoint.
No long audio operations run inside API requests; durable execution starts in
Phase 06. Windmill v1.817.0 source archive was inspected in /tmp for preparation;
no orchestration service is yet running.

### Phase 05 verification
Migration 0004 creates relational project/song/audio/job/workflow entities with
workspace/project foreign keys, version constraints, same-song plan references
and one active plan per song. Source uploads use private exclusive object writes,
strict FFprobe format/protocol limits, authenticated streamed multipart bounds,
transactional cleanup and ranged authenticated downloads. API: 33 tests passed,
including migration round trips, invalid/chunked uploads and fsync/commit failures.
Deployed FFprobe is Debian 7.1.5; its actual license/version is recorded in inventory.
Alembic drift check, Ruff, web lint/build/typecheck and diff check passed.

Browser: 89 passed in 49.8s. Tested actual create/edit/search/revisit, full song
brief fields, invalid upload, generated WAV playback/ranges/download SHA256,
original lineage, library and restored song context. Four viewport screenshots
reviewed; mobile upload control stacking and name maxlength alignment repaired.
Initial test selector ambiguity was fixed without weakening upload assertions.
`check-recovery.py --project-id 6996164a-459a-43af-b538-4191c2f96195` restarted
only Studio PostgreSQL/API and confirmed identical project/song/asset metadata
and downloaded checksums, while restoring settings and revoking its session.
Generated fixtures are explicitly labeled, with private manifests under ignored
test-results. Protected outside-Studio baseline still matches all 293 files.
Final mobile upload/name-limit revision: two targeted domain cases passed in 7.4s,
and its updated mobile screenshot was visually inspected.

### Phase 06 recovery checkpoint (2026-09-23)
The interrupted implementation has been recovered without resetting unrelated
work. It adds durable `job_attempts`/`job_outbox` records and migration 0005
(including a backfill for existing Phase 05 jobs), dispatcher reconciliation,
attempt leases, worker-only internal job routes, a fixed `system.verify` local
diagnostic, a source-built Windmill image, a tagged worker image, and browser
job activity/retry/cancel views. The source image is pinned to Windmill v1.817.0
and archive SHA256 `093ba2e8a9d436de80ffaf52bb0abee2998e5fc82d3d646dbbb07d2c89ca84ce`.

Completed checks: `python3 scripts/test-api.py` reported 41 passed; worker
unittests reported 5 passed; `npm run lint`, `npm run typecheck`, `npm run build`,
`git diff --check`, Compose config, and Python import/compile checks passed. The
Windmill and worker/API/web images were rebuilt successfully after the recovered
changes. These checks predate the final real-Windmill acceptance gate.

The source-built OSS server is live locally with its bootstrap secret removed.
Live provisioning reached workspace creation, then confirmed that
`POST /api/users/create` returns HTTP 500: `User creation is not implemented in
the open-source version. @users_oss.rs:40:9`. The current provisioner therefore
cannot create its intended restricted ordinary machine identity, runtime token,
or script hash. No diagnostic execution, worker restart/recovery, or browser
orchestration tests have passed. The implementation remains uncommitted until
that OSS-compatible credential/provisioning design is corrected and verified.
See `docs/CODEX_HANDOFF.md` for exact runtime state and resume commands.

### Phase 06 OSS provisioning correction
Pinned OSS v1.817.0 does not support ordinary-user or service-account
provisioning. The recovered provisioner was corrected to create only the existing
`studio` workspace and fixed script, persist its script hash, and remove the
bootstrap secret. It explicitly refuses to use the reserved superadmin identity
as the dispatcher credential. `0005_orchestration` is applied to the rebuilt API;
41 API tests, 5 worker tests, lint, typecheck, build and boundary verification
pass. The remaining live diagnostic, worker/dispatcher recovery and browser gate
are blocked only on a normal-account token scoped to
`jobs:run:scripts:f/studio/execute`, recorded in `docs/HUMAN_BLOCKERS.md`.
