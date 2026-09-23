# Architecture Decision Log

## ADR-001 — Studio Lives in Hungree Goat Monorepo
Status: Accepted

AI Music Studio is located at `apps/ai-music-studio` inside `amaeteventurestudios/hungreegoat`. It is not a nested Git repository.

## ADR-002 — Protect Existing Apps
Status: Accepted

`apps/control`, `apps/player`, and `apps/dj-studio` are sibling apps and are no-touch by default for Studio tasks.

## ADR-003 — Windmill for V1 Orchestration
Status: Accepted

Use Windmill for workflows, worker routing, retries, and operational execution state. Do not introduce Temporal in V1.

## ADR-004 — PostgreSQL Is Domain Truth
Status: Accepted

Windmill state does not replace Studio domain records.

## ADR-005 — shadcn/ui First
Status: Accepted

Use shadcn/ui and Base UI for standard components.

## ADR-006 — Immutable Audio
Status: Accepted

Every transformation creates a new asset and lineage relationship.

## ADR-007 — Provider Abstractions
Status: Accepted

No shared domain/UI code depends directly on ElevenLabs, Demucs, Matchering, or one provider implementation.

## ADR-008 — Local Filesystem First
Status: Accepted

Use local storage behind `StorageProvider` in V1. Object storage can come later.

## ADR-009 — Docker Compose, Not Kubernetes
Status: Accepted

V1 uses Docker Compose and Caddy.

## ADR-010 — Tempo Stretch vs Double-Time
Status: Accepted

Literal tempo transformation is distinct from a musical double-time/half-time remix concept.

## ADR-011 — Canonical Source vs Runtime
Status: Accepted

Canonical source is under `/home/aumanah/hungree-goat-src/hungreegoat-canonical`. `/home/aumanah/hungree-goat` is runtime/deployment, not authoring source.

## ADR-012 — Studio-local Tooling and Environment Isolation
Status: Accepted (Phase 00, 2026-09-23)

Root inspection found no workspace manifest requiring integration. Plan an npm
workspace and lockfile inside Studio for the web and shared TypeScript packages,
with separate Python dependency environments for the API and workers. Introduce
the executable manifests in Phase 01. Root tooling and sibling apps remain unchanged.

Use `STUDIO_*` server configuration, explicit `hg-studio-dev/test/prod` Compose
project names, project-scoped networks/volumes, and external persistent storage.
The environment template is a naming contract until Phase 01 implements validation.
See `MONOREPO_LAYOUT.md` for paths and configuration ownership.

No architecture deviations are introduced. The existing nginx gateway is recorded
as a constraint for later Studio Caddy integration, not altered by this phase.

## ADR-013 — Isolated Foundation Services
Status: Accepted (2026-09-23)

Use Node 24 and Python 3.12 containers, exact npm/uv dependency locks, and
PostgreSQL 17.11. Studio Compose has a separate project/network/volume, no database
host port, bounded service resources, and loopback web/API ports 3210/8310.
The web health proxy uses a server-only API origin. Migrations run in a one-shot
service before API startup. Assets live in a private external user-owned directory.
Development bootstrap generates credentials; it never overwrites an existing env.

The existing gateway has no Studio route and available SSH access is read-only.
Production will use a dedicated route/tunnel when an administrator grants it;
local deployment and verification proceed independently.

## ADR-014 — Private Owner and Server-side Sessions
Status: Accepted (2026-09-23)

Bootstrap a single owner through a protected CLI; there is no public registration.
Passwords use Argon2. Opaque sessions are hashed in PostgreSQL, time-limited,
revocable, HttpOnly and SameSite=Lax; production additionally requires HTTPS and
Secure __Host cookies. Unsafe browser requests require exact configured Origin;
authenticated writes additionally require a session-bound CSRF token. Membership
and workspace context come from the session, never client authorization claims.
Account/source throttles and bounded hashing limit login resource usage.

Workspace preferences use validated JSONB. Errors omit submitted values and
provider/password bodies. The web proxy has a fixed server origin, rejects internal
paths, preserves cookies and bounds request bodies. Development-only operator
helpers keep generated credentials outside source with restricted permissions.
