# Architecture Decision Log

## ADR-001 — Studio Lives in Hungree Goat Monorepo
Status: Accepted

AI Music Studio lives at `apps/ai-music-studio` inside `amaeteventurestudios/hungreegoat`; it is not a nested repository.

## ADR-002 — Protect Existing Apps
Status: Accepted

`apps/control`, `apps/player`, `apps/dj-studio`, and the broadcast stack are protected from unrelated Studio work.

## ADR-003 — Windmill Is the Initial V1 Orchestrator, Not an Approval Gate
Status: Accepted

Windmill is the initial orchestration implementation. If its mechanism, version, edition, or identity model cannot satisfy requirements safely, Codex may autonomously reconfigure, upgrade/downgrade, change the authentication flow, or replace it behind the orchestration abstraction. The product contract takes precedence over preserving a broken implementation choice.

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

Use local storage behind `StorageProvider` initially; object storage may replace it later.

## ADR-009 — Docker Compose, Not Kubernetes
Status: Accepted

V1 defaults to Docker Compose and Caddy, with isolated Studio project names, networks, volumes, and loopback ports.

## ADR-010 — Tempo Stretch vs Double-Time
Status: Accepted

Literal tempo transformation is distinct from musical double-time/half-time concepts.

## ADR-011 — Canonical Source vs Runtime
Status: Accepted

Canonical source is `/home/aumanah/hungree-goat-src/hungreegoat-canonical`; `/home/aumanah/hungree-goat` is runtime/deployment.

## ADR-012 — Owner-Independent Engineering
Status: Accepted

Within the Studio boundary, Codex may make and execute technical decisions without routine approval. A failed plan requires investigation and an architecture-preserving substitution, not interruption. Owner interruption is reserved for proven external human-only actions or the usage-safety stop.

## ADR-013 — Cost-Aware Model Routing
Status: Accepted

Use Luna/Terra for most labor, Sol selectively for review/escalation, and Astra only exceptionally. Child model and reasoning effort are explicit.

## ADR-014 — Usage Reserve
Status: Accepted

At 70% weekly usage begin conservation. At 80% weekly usage checkpoint and stop, preserving the requested reserve.

## ADR-015 — Private Owner and Server-Side Sessions
Status: Accepted

Bootstrap one owner without public registration. Passwords use Argon2; opaque PostgreSQL-backed sessions are time-limited, revocable, HttpOnly, SameSite=Lax, and require exact Origin plus session-bound CSRF protection for unsafe authenticated requests.

## ADR-016 — Encrypted Provider Credentials
Status: Accepted

Provider secrets are server-only encrypted files referenced by opaque IDs in PostgreSQL. Browser responses expose only masked hints and status. Rotation is transactional and retains data integrity.

## ADR-017 — Durable Orchestration Boundary
Status: Accepted (Phase 06)

The API persists canonical jobs, attempts, outbox records, and immutable events. A dispatcher submits only bounded identifiers to an orchestrator. Workers claim, progress, and finalize through authenticated internal APIs; neither browser nor API request executes long audio work directly. Derived assets remain immutable and lineage-tracked.
