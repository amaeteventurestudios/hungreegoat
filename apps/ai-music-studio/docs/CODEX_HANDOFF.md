# Codex handoff — 2026-09-23

> **Current update — supersedes the historical snapshot below:** Phase 06 has a
> source-backed OSS provisioning design. Pinned Windmill OSS v1.817.0 cannot
> create ordinary users or service accounts. The provisioner now bootstraps only
> the `studio` workspace and fixed `f/studio/execute` script, persists its hash,
> and removes the bootstrap secret; it never uses the reserved superadmin
> identity for runtime work. The rebuilt Studio API is at
> `0005_orchestration (head)`, API/web readiness passes, 41 API tests and 5
> worker tests pass, and lint/typecheck/build/boundary checks pass. The remaining
> live diagnostic, worker/dispatcher recovery, browser orchestration and visual
> gates need a normal, non-superadmin Windmill account token with
> `workspace_id=studio` and exact scope `jobs:run:scripts:f/studio/execute` in
> the private 0600 `windmill-token` file. `script-hash` is populated;
> `windmill-token` remains empty. See `docs/HUMAN_BLOCKERS.md`. Resume with Terra
> High after the token exists, verify permitted exact-script/own-job polling and
> denied list/other-script access without printing the token, then run the live
> acceptance commands already listed below. Check the local usage guard before
> and after each major batch.
>
> The last coherent Phase 06 implementation commit is `ebd0b28 feat(studio):
> add durable windmill orchestration`. Phase 07 depends on this live job path and
> must not begin until the Phase 06 runtime-token gate passes.

## Current phase and task

Phase 06 (Orchestration Kernel) is in progress. The current task is to finish
the live Windmill integration gate for the existing durable-job implementation,
then run the Phase 06 recovery and browser acceptance checks. Do not restart
the project or redo Phases 00–05.

## Completed work

- Recovered the interrupted Phase 06 implementation already present in the
  working tree. It includes migration `0005_orchestration`, durable attempts and
  outbox rows, a dispatcher, internal worker claim/progress/finalize routes,
  immutable job events, retry/cancel behavior, a deterministic `system.verify`
  diagnostic, tagged Windmill worker packaging, and UI job activity.
- Migration 0005 now backfills one attempt for every existing Phase 05 job and
  queues nonterminal jobs, so old jobs do not acquire an unusable current
  attempt.
- Built `hg-studio-windmill:1.817.0-source` from pinned upstream source and
  rebuilt `hg-studio-api:local`, `hg-studio-worker:local`, and
  `hg-studio-web:local` successfully.
- The Windmill server and its dedicated PostgreSQL instance are running. The
  server entrypoint strips an empty `SUPERADMIN_SECRET`; inspection confirmed
  its current container environment has `SUPERADMIN_SECRET=`.
- The provisioner successfully created the `studio` workspace. Its intended
  normal machine account cannot be created in this Windmill OSS build.

## Uncommitted Studio files

Modified:

- `apps/api/migrations/env.py`
- `apps/api/src/studio_api/config.py`
- `apps/api/src/studio_api/domain_models.py`
- `apps/api/src/studio_api/domain_routes.py`
- `apps/api/src/studio_api/main.py`
- `apps/web/src/app/page.tsx`
- `apps/web/src/components/domain/project-pages.tsx`
- `apps/web/src/components/domain/song-pages.tsx`
- `apps/web/src/components/workstation.tsx`
- `infra/docker/compose.yaml`
- `packages/contracts/src/index.ts`
- `tests/browser/README.md`
- `tests/browser/playwright.config.ts`
- `docs/exec-plans/active/autonomous-01-14.md`

Untracked:

- `apps/api/migrations/versions/0005_orchestration_durable_orchestration.py`
- `apps/api/src/studio_api/{diagnostic,dispatcher,job_routes,job_service,orchestration_client,orchestration_models}.py`
- `apps/api/tests/test_orchestration.py`
- `apps/web/src/components/job-activity.tsx`
- `apps/web/src/hooks/use-jobs.ts`
- `apps/web/src/lib/job-client.ts`
- `apps/worker/`
- `docs/ORCHESTRATION_CONTRACT.md`
- `docs/CODEX_HANDOFF.md`
- `infra/windmill/`
- `scripts/{bootstrap-orchestration,create-diagnostic-job,provision-orchestration}.py`
- `tests/browser/{diagnostic-fixture,orchestration.spec}.ts`

Do not stage `apps/control/hgc/dj_orchestrator.py` or root `docs/` files/images:
they are unrelated pre-existing changes.

## Test and build results

- `python3 scripts/test-api.py`: **41 passed** (before the final live gate).
- `PYTHONPATH=apps/worker python3 -m unittest discover -s apps/worker/tests -v`:
  **5 passed**.
- `npm run lint`, `npm run typecheck`, `npm run build`: passed.
- `git diff --check`: passed at checkpoint.
- `bash scripts/compose.sh config --quiet`: passed before the live provision run.
- Windmill source image built successfully from v1.817.0 source archive SHA256
  `093ba2e8a9d436de80ffaf52bb0abee2998e5fc82d3d646dbbb07d2c89ca84ce`.
- No live diagnostic, worker restart/recovery, or Phase 06 Playwright execution
  has passed yet.

## Running processes and relevant logs

Running Studio containers at checkpoint:

- `studio-api`: healthy on `127.0.0.1:8310` but still the older Phase 05
  container; it must be recreated after a provisioning fix so migration 0005
  is applied.
- `studio-web`: healthy on `127.0.0.1:3210`, also the older container.
- `studio-postgres`: healthy.
- `studio-windmill-postgres`: healthy.
- `studio-windmill`: running, no bootstrap secret configured, currently degraded
  only because no worker is started.
- `studio-worker` and `studio-dispatcher`: not started.

Relevant commands/logs:

```bash
bash scripts/compose.sh logs --tail=160 studio-windmill studio-windmill-postgres
bash scripts/compose.sh ps --all
```

The meaningful live server log is:

```text
POST /api/users/create -> HTTP 500
User creation is not implemented in the open-source version. @users_oss.rs:40:9
```

Earlier PostgreSQL `relation ... does not exist` messages occurred during the
initial Windmill schema bootstrap and were followed by successful server startup.

## Blocker

`scripts/provision-orchestration.py` assumes the upstream ordinary-user API is
available. In the pinned Windmill OSS server it is deliberately unimplemented.
The next implementation must choose and verify an OSS-compatible least-privilege
provisioning mechanism. Do not work around this by leaving a superadmin bootstrap
secret mounted at runtime. Do not claim the restricted dispatcher token exists;
`windmill-token` and `script-hash` remain empty private files.

The active workspace already exists. The next implementation should inspect the
pinned source/OSS schema and supported APIs for a safe supported approach,
preferably using a pre-provisioned identity/token facility that keeps the runtime
token scoped to `jobs:run:scripts:f/studio/execute`. If this cannot be achieved
in OSS, amend the Phase 06 architecture and documentation before proceeding.

## Exact next commands

Run from `apps/ai-music-studio`:

```bash
git status --short
sed -n '1,320p' scripts/provision-orchestration.py
sed -n '1,360p' apps/api/src/studio_api/orchestration_client.py
sed -n '1,360p' docs/ORCHESTRATION_CONTRACT.md
bash scripts/compose.sh ps --all
bash scripts/compose.sh logs --tail=160 studio-windmill
```

Then inspect the exact pinned Windmill v1.817.0 OSS source/API behavior for a
supported restricted token path; update only the Studio provisioner/contract and
test it live. After that:

```bash
python3 scripts/provision-orchestration.py
bash scripts/compose.sh up -d --force-recreate studio-migrate studio-api studio-web studio-worker studio-dispatcher
python3 scripts/create-diagnostic-job.py --help
python3 scripts/test-api.py
PYTHONPATH=apps/worker python3 -m unittest discover -s apps/worker/tests -v
python3 scripts/test-browser.py
git diff --check
python3 scripts/check-boundary.py
```

Run the Phase 06 real diagnostic, cancellation/retry/restart checks and the
browser orchestration suite only after the runtime credential path is verified.

## Recommended resume model and prompt

Use **Terra High** for the credential-boundary recovery and live integration;
delegate source scans and mechanical validation to **Luna Low/Medium** and use
**Sol** only for an architecture review if the OSS limitation requires a contract
change.

Exact resume prompt:

> Resume Phase 06 from `apps/ai-music-studio/docs/CODEX_HANDOFF.md`. Preserve
> every uncommitted Studio change and all unrelated repository changes. First
> inspect status, the handoff, active execution record, provisioner, live
> Windmill logs, and the pinned v1.817.0 OSS source/API. Replace the unsupported
> ordinary-user provisioning flow with a verified OSS-compatible least-privilege
> design; never retain a bootstrap superadmin secret at runtime. Then complete
> the real diagnostic/retry/cancel/recovery/browser acceptance gate, document it,
> commit only coherent Studio-scoped Phase 06 work, and continue autonomously
> from Phase 07 according to `PHASES.md` and `MODEL_ROUTING.md`.
