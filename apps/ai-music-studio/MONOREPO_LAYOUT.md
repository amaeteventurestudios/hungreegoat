# Monorepo Layout and Boundaries

## Canonical Source
- GitHub: `amaeteventurestudios/hungreegoat`
- Canonical checkout: `/home/aumanah/hungree-goat-src/hungreegoat-canonical`
- Studio source: `/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio`
- Runtime tree: `/home/aumanah/hungree-goat`
- Production URL: `https://studio.hungreegoat.com`

## Existing Hungree Goat Apps
- `apps/control/`
- `apps/dj-studio/`
- `apps/player/`

AI Music Studio is:
- `apps/ai-music-studio/`

## Source vs Runtime
The canonical checkout is where Codex edits and Git tracks source.

The runtime tree is deployment state. Do not treat `/home/aumanah/hungree-goat` as the canonical authoring workspace.

Deployment must be explicit and reproducible from canonical source to runtime.

## Git Boundary
There is one Git repository for these applications.

Do not:
- run `git init` inside the Studio
- add a nested `.git`
- create a separate Studio repo unless the owner explicitly changes this architecture later

## Protected Sibling Apps
Default no-touch:
- `apps/control/`
- `apps/player/`
- `apps/dj-studio/`

A Studio task may change them only if the integration genuinely requires it, the execution plan names exact files, existing behavior is preserved, relevant tests run, and the final summary calls out the impact.

## Preferred Working Directory
For Studio-focused Codex sessions:

```bash
cd /home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio
```

Git operations still resolve to the parent repository.

## Staging Rule
Always inspect `git status --short` before staging. Stage only Studio paths unless the task explicitly includes cross-app work. Never reset or discard unrelated modified/untracked files.

## Phase 00 inspection (2026-09-23)
The canonical root has no JavaScript package manifest, workspace manifest, or
Compose file. Sibling manifests use independent scripts: Player uses npm/Vite,
Website uses `packages/shared/build.mjs`, and DJ Studio is static. Root deployment
documentation describes Docker/systemd on Beelink, a legacy Pi deployment path,
Vercel frontends, and an nginx gateway. This is a source inspection, not a live
deployment health check.

Studio does not need a root workspace change. The existing shared CSS and build
script are not Studio dependencies. Caddy remains the planned Studio proxy; its
eventual integration must account for the existing gateway without replacing it.

## Studio-local workspace plan
Paths below are relative to this directory. Phase 00 created placeholders;
subsequent phases replace these with the implementations described here.

| Path | Ownership and planned implementation |
|---|---|
| `apps/web/` | Next.js browser application; all domain calls go through Studio API |
| `apps/api/` | FastAPI control plane, Python metadata, migrations, API tests |
| `packages/ui/` | Studio shadcn/Base UI components and tokens |
| `packages/contracts/` | Provider-neutral TypeScript API contracts |
| `packages/config/` | Shared Studio TypeScript/lint configuration |
| `workers/audio/` | Audio engine adapters and worker dependencies |
| `workers/separation/` | Isolated stem-separation dependencies |
| `workers/mastering/` | Isolated mastering dependencies |
| `windmill/flows/` | Workflow definitions and worker routing |
| `windmill/scripts/` | Execution entrypoints, including AI-provider tasks |
| `infra/docker/` | Studio Dockerfiles and future `compose.yaml` |
| `infra/caddy/` | Future Studio proxy configuration |
| `tests/` | Cross-service integration, E2E, and safe fixtures |

Phase 01 should introduce a private npm workspace manifest and lockfile at the
Studio root for `apps/web` and `packages/*`, with `@hungreegoat/studio-*` package
names. Run npm commands from Studio; do not absorb sibling apps into this workspace.
Use independent Python project metadata and reproducible dependency locks for the
API and, when implemented, each worker. No dependencies are installed in Phase 00.
Select and verify concrete runtime/package versions during Phase 01.

## Environment naming contract
`.env.example` documents the implemented local settings. API settings use typed
validation; `scripts/bootstrap.py` generates a private environment for Compose.

| Setting | Meaning |
|---|---|
| `STUDIO_ENV` | `development`, `test`, or `production` |
| `COMPOSE_PROJECT_NAME` | `hg-studio-dev`, `hg-studio-test`, or `hg-studio-prod` |
| `STUDIO_LOG_LEVEL` | Structured server log verbosity |
| `STUDIO_BIND_HOST` | Local development host binding, default `127.0.0.1` |
| `STUDIO_WEB_PORT` / `STUDIO_API_PORT` | Proposed host ports `3210` / `8310`; verify availability before binding |
| `STUDIO_PUBLIC_URL` | Browser-facing origin; production uses `https://studio.hungreegoat.com` |
| `STUDIO_DATABASE_URL` | Server-only PostgreSQL connection string; example intentionally blank |
| `STUDIO_ASSET_ROOT` | Absolute persistent asset directory outside Git; example intentionally blank |

The proposed API port avoids the existing Liquidsoap loopback mount documented on
port 8100. Phase 01 must still inspect local listeners and choose unused ports via
configuration before startup; these examples reserve no host resources.
Browser calls should use a same-origin `/api` route, wired to the API by the web
server/proxy in Phase 01. Internal API addresses and credentials stay server-side.
Introduce `NEXT_PUBLIC_STUDIO_*` settings only for deliberately public values if
needed; never expose database or provider credentials through that prefix.

Keep development secrets in ignored `.env` files. Test configuration must use its
own database and asset directory. Production secrets belong outside source and
must be injected explicitly, with no development credential defaults.

## Deployment isolation plan
Future Compose commands must name the Studio file and project explicitly. Services
use the `studio-*` names in `DEPLOYMENT.md`; networks and volumes should be scoped
by the Compose project, with no fixed `container_name`, external broadcast network,
or root deployment hooks. PostgreSQL and worker ports remain internal. Development
web/API ports bind to loopback. Phase 01 must verify listeners and existing Compose
projects before choosing ports or starting containers.

Future runtime artifacts belong under `/home/aumanah/hungree-goat/apps/ai-music-studio`
as a dedicated release subtree. Persistent data/backups/secrets use the proposed
`/srv/ai-music-studio/` locations in `DEPLOYMENT.md`. Neither location is created or
deployed by Phase 00. Deploy from a recorded canonical revision, not manual runtime
edits. Production routing remains a later explicit integration task.

## Execution plans
Copy [the plan template](docs/exec-plans/TEMPLATE.md) into
`docs/exec-plans/active/` before multi-file implementation. Record checks actually
run and remaining blockers, then move the completed plan to
`docs/exec-plans/completed/`. Keep phase scope and cross-app impact explicit.
