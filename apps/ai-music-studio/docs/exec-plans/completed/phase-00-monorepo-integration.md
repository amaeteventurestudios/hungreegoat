# Phase 00 execution plan

Status: Complete
Date: 2026-09-23

## Scope
Verify the existing monorepo, document an isolated Studio workspace and environment
conventions, and add directories for future implementation. Execute Phase 00 only.

## Non-goals
No application dependencies, running services, database schema, UI, provider
integration, production deployment, root workspace changes, or Git commits.

## Inspection
- Git resolves to `/home/aumanah/hungree-goat-src/hungreegoat-canonical`.
- Root has no `package.json`, workspace manifest, or Compose configuration.
- Player uses npm/Vite, Website uses a shared build script, and DJ Studio is static.
- Root deployment docs describe Beelink Docker/systemd, legacy Pi deployment,
  Vercel frontends, and an nginx gateway. These are existing source-documented
  arrangements; live infrastructure was not queried.
- Studio currently contains specification documents and execution-plan directories.
- Initial index is empty; no Studio `.git` file or directory exists.

## Affected paths
All relative to `apps/ai-music-studio/`:
- `MONOREPO_LAYOUT.md`, `DECISIONS.md`, `README.md`, `PHASES.md`
- `.gitignore`, `.env.example`
- `apps/`, `packages/`, `workers/`, `windmill/`, `infra/`, `tests/`
  (directory placeholders only)
- `docs/exec-plans/` (template and this completion record)

## Steps
1. Capture baseline hashes of tracked and non-ignored untracked files outside Studio.
2. Document workspace, configuration, environment, and deployment naming.
3. Add scoped ignore rules, a non-secret environment template, and scaffolding.
4. Verify Git boundary, placeholder paths, ignore behavior, whitespace, unchanged
   outside-Studio contents, and unchanged empty index.
5. Archive this plan with results and provide the Phase 01 prompt.

## Data/model impact
None. Environment names are reserved for Phase 01 and have no runtime consumer yet.

## Test plan
Run `git diff --check`, `git rev-parse --show-toplevel`, nested `.git` inspection,
`git check-ignore` checks for local secrets/build outputs versus `.env.example`,
and Python assertions for planned scaffolding and baseline content preservation.
No executable product behavior is introduced, so application tests and visual QA
are not applicable.

## Deployment impact
None. Future Compose configuration will be Studio-local with separate project names.
No runtime writes, service commands, DNS changes, or Caddy/nginx changes.

## Rollback approach
Remove only the additions and documentation edits recorded in this plan. Do not
reset the repository or remove any pre-existing files.

## Cross-App Impact
None. Root tooling, shared packages, sibling apps, broadcast, and runtime are read-only.

## Pre-existing unrelated changes
- Modified: `apps/control/hgc/dj_orchestrator.py`
- Untracked: `docs/YOUTUBE_OAUTH_HANDOFF.md`
- Untracked: `docs/images/for-businesses-reference-page.png`
- Untracked: `docs/images/hungree-goat-business-og.webp`
- Untracked: `docs/images/menu-bar.png`

## Results
- `git rev-parse --show-toplevel`: canonical Hungree Goat root confirmed.
- `find . -name .git -print` and Python recursive check: no nested Git metadata.
- `git diff --cached --name-only`: empty index before and after work; nothing staged.
- `git diff --check`: passed.
- Python assertions: all 13 planned implementation directories contain `.gitkeep`.
- `git check-ignore -q -- <path>` assertions: 10 secret/cache/output paths ignored;
  4 template/source paths remain trackable, including `.env.example`.
- SHA-256 baseline comparison: all 293 tracked/non-ignored untracked files outside
  Studio have identical paths and contents after implementation. This includes
  all five pre-existing unrelated changes listed above.
- Source inspection commands: `cat`, `rg --files`, `rg -n`, `ls -la`, `find`,
  and `git status --short`; read the required Studio specifications, sibling
  manifests, root ignore rules, and root deployment documentation.
- Implementation used `apply_patch` and Python filesystem operations scoped to
  Studio; baseline hashes were stored in `/tmp/studio-phase00-baseline.json`.
- No product tests or visual QA apply to placeholder/documentation changes.
  No services, external providers, runtime health, or deployment were tested.

## Decisions and blockers
ADR-012 records local npm/Python tooling and environment isolation. No root
workspace integration or architecture deviation was necessary. Proposed API port
8310 avoids the documented Liquidsoap port 8100; actual availability remains a
Phase 01 preflight check. There are no Phase 00 blockers. Dependency versions,
executable configuration, and local service verification belong to Phase 01.

## Exact recommended Phase 01 prompt
```text
Execute Phase 01 only for Hungree Goat AI Music Studio in
/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio.
Read AGENTS.md and the required docs in order, then read
docs/exec-plans/completed/phase-00-monorepo-integration.md and
docs/phases/PHASE_01_FOUNDATION.md. Create an active execution plan from
docs/exec-plans/TEMPLATE.md before implementation.

Implement the Studio-local npm workspace, Next.js web, FastAPI API,
PostgreSQL, SQLAlchemy/Alembic, isolated Docker Compose configuration,
typed environment validation, structured logging, health endpoints, and
local development wiring. Follow MONOREPO_LAYOUT.md and ADR-012. Verify
runtime/dependency versions, check local ports and existing Compose projects,
and use reproducible dependency locks. Prove services start independently,
the API reaches PostgreSQL, migrations apply, the web reaches the API,
and health checks pass. Run relevant automated tests and visual QA for
any UI introduced; report exact commands and results.

Keep implementation inside Studio. Preserve sibling apps, root deployment
behavior, and all unrelated work. Do not stage or commit unrelated files,
create a nested repository, deploy to production, or start Phase 02.
Do not add Kubernetes, Kafka, RabbitMQ, Temporal, Elasticsearch, or Redis.
Record deviations in DECISIONS.md, archive the execution plan when complete,
and report changed files, verification, decisions, untouched pre-existing
changes, blockers, and the exact recommended Phase 02 prompt.
```
