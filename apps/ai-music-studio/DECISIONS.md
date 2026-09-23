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
