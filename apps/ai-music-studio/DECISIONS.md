# Architecture Decision Log

## ADR-001 — Studio Lives in Hungree Goat Monorepo
Status: Accepted

AI Music Studio lives at `apps/ai-music-studio` inside `amaeteventurestudios/hungreegoat`. No nested Git repository.

## ADR-002 — Protect Existing Apps
Status: Accepted

`apps/control`, `apps/player`, `apps/dj-studio`, and the broadcast stack are protected from unrelated Studio work.

## ADR-003 — Windmill Is the Initial V1 Orchestrator, Not an Owner Approval Gate
Status: Accepted

Windmill is the initial orchestration implementation. If a Windmill mechanism/version/edition cannot satisfy requirements safely, Codex may autonomously reconfigure, upgrade/downgrade, change the supported auth flow, or replace the orchestration implementation behind the abstraction. The product contract matters more than preserving a broken implementation choice.

## ADR-004 — PostgreSQL Is Domain Truth
Status: Accepted

Operational workflow state does not replace Studio domain records.

## ADR-005 — shadcn/ui First
Status: Accepted

Use shadcn/ui and Base UI for standard components.

## ADR-006 — Immutable Audio
Status: Accepted

Every transformation creates a new asset and lineage relationship.

## ADR-007 — Provider Abstractions
Status: Accepted

Shared domain/UI code does not depend directly on one provider implementation.

## ADR-008 — Local Filesystem First
Status: Accepted

Use local storage behind `StorageProvider` initially. Object storage may replace it later.

## ADR-009 — Docker Compose, Not Kubernetes
Status: Accepted

V1 defaults to Docker Compose and Caddy. Codex may alter Studio-local deployment details when required, while preserving operational simplicity.

## ADR-010 — Tempo Stretch vs Double-Time
Status: Accepted

Literal tempo transformation is distinct from musical double-time/half-time concepts.

## ADR-011 — Canonical Source vs Runtime
Status: Accepted

Canonical source: `/home/aumanah/hungree-goat-src/hungreegoat-canonical`.
Runtime/deployment: `/home/aumanah/hungree-goat`.

## ADR-012 — Owner-Independent Engineering
Status: Accepted

Within the Studio boundary, Codex has standing authority to make and execute technical decisions without routine owner approval.

A failed planned path is not a stop condition. Codex should investigate, choose an architecture-preserving supported alternative, implement, verify, document, and continue.

Owner interruption is reserved for proven external human-only actions or the mandatory usage-safety stop.

## ADR-013 — Cost-Aware Model Routing
Status: Accepted

Use Luna/Terra for most labor, Sol selectively for coordination/review/escalation, and Astra only exceptionally. Child model and reasoning effort are explicitly specified.

## ADR-014 — Usage Reserve
Status: Accepted

At 70% weekly usage begin wrap-up/conservation. At 80% weekly usage perform mandatory checkpoint/handoff/stop to preserve approximately 20% reserve.
