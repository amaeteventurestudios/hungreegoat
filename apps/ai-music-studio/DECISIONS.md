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

## ADR-018 — Local OSS Runtime Identity Bootstrap
Status: Accepted (Phase 06)

Pinned Windmill OSS deliberately disables ordinary-user provisioning. For the isolated local development instance, the Studio provisioner owns the dedicated Windmill database and atomically creates the smallest compatible identity: one non-admin, non-service-account workspace member, a hash-only 30-day token pinned to `studio` and `jobs:run:scripts:f/studio/execute`, read-only RLS visibility of the immutable fixed script, and the `studio-ai` tag allowlist. The raw token is only a 0600 private file. This replaces the unavailable HTTP lifecycle without retaining any superadmin runtime credential.

## ADR-019 — Lease Expiry Is a Safe Worker-Interruption Boundary
Status: Accepted (Phase 06)

The Studio attempt lease is the authoritative liveness signal when a Windmill worker disappears but leaves a remote run nonterminal. Dispatcher reconciliation terminally fails an expired running lease instead of redispatching its execution ID. `system.verify` may be deliberately retried; future provider operations are marked outcome-unknown and require explicit reconciliation, preventing blind duplicate paid work.

## ADR-020 — Provider-Neutral Structured Producer Plans
Status: Accepted (Phase 07)

Production plans are validated against one Studio-owned schema and persisted as immutable versions. A lease-bound worker adapter translates that schema to each provider's supported structured-output request shape; raw credentials and provider responses never reach the browser. Settings selects the enabled provider and model, while any later regeneration preserves prior plan history.

## ADR-021 — Leased Worker Audio Intake for Music Generation
Status: Accepted (Phase 08)

ElevenLabs Music responses are fetched only by the leased Studio worker and sent to a bounded, authenticated internal intake endpoint. The API independently validates the audio, writes an immutable asset, and records a generic `GenerationVersion` with provider request metadata. A lost provider response is outcome-unknown and cannot be blindly retried; safe retries resume already committed versions without duplicate generation.

## ADR-022 — Non-Destructive Generation Review
Status: Accepted (Phase 09)

Waveform playback uses authenticated same-origin asset streams in the browser; no browser audio engine writes canonical assets. Favorite, notes, approval, and rejection are workspace-scoped metadata on immutable generated versions. A database constraint and API transition logic prevent simultaneous approval and rejection. Switching A/B playback pauses the other slot and preserves the current comparison position; new generation requests remain explicit paid actions.

## ADR-023 — Arrangement Plans Are Immutable Metadata Revisions
Status: Accepted (Phase 10)

The existing `Arrangement` domain table stores bounded section plans linked to an approved generated version and its unchanged source asset. A locked parent row and required base revision serialize concurrent writes; edits and restoration append rather than mutate history. The current music adapter has no Studio-supported section-targeted regeneration contract, so the UI presents a truthful metadata-only fallback instead of implying that moving sections edits recorded audio.

## ADR-024 — Leased Local Audio Analysis and Tempo Rendering
Status: Accepted (Phase 11)

The Studio worker performs bounded FFprobe/Librosa/SoundFile analysis and FFmpeg Rubber Band tempo rendering; the API only schedules jobs and validates/stores results. The worker's immutable asset mount is read-only. Tempo output commits a new FLAC asset, `TempoVersion`, and source lineage atomically under the current lease; a committed result is reused on retry. Analysis metadata is versioned by analyzer identifier. Browser preview changes playback rate only and does not claim pitch/formant fidelity. The API caps sources and outputs at ten minutes and limits speed to 0.5–2× to bound CPU, output size, and audible artifacts.

## ADR-025 — Bounded Four-Stem Separation and Immutable Mixes
Status: Accepted (Phase 12)

Demucs 4.0.1 `htdemucs` runs in the isolated Studio worker behind `StemSeparator`, with its model cached in the worker image, CPU-only PyTorch, read-only source mount, seven-second chunks, a three-minute input cap, and a 4 GiB worker limit shared with Phase 13 mastering. The model's documented/observed maximum chunk is 7.8 seconds; a ten-second chunk failed the real fixture. Each of vocals, drums, bass, and other is independently leased, format/duration-validated, and atomically recorded as an immutable FLAC asset, `Stem`, and source lineage. Partial committed stems are reused after safe retry. A mix job reads all four stems and renders a separate FLAC `MixVersion` with four parent lineage edges. FFmpeg filters/codec threads are constrained because its default fan-out exceeded the worker's 128-process limit. Neither monitoring controls nor recombination overwrite source or stems.

## ADR-026 — Reference Mastering and Truthful Delivery Artifacts
Status: Accepted (Phase 13)

Mastering is a durable, retry-safe local audio job. A reference selects Matchering 2.0.6 behind `MasteringProvider` for tonal guidance; without a reference, FFmpeg loudnorm is the explicit supported alternative. Both paths apply bounded loudness/true-peak targets and create a new validated FLAC master with source and optional reference lineage. WAV 16/24-bit and MP3 bitrate exports are separate immutable audio assets and lineage edges. A four-stem ZIP is not represented as an `AudioAsset`: it has its own `StemPackage` table, private object key, job linkage, SHA-256 manifest of the exact source stems, strict archive validation, and authenticated download. All engines read immutable source objects from the worker's read-only mount. Matchering is GPLv3 and must remain isolated behind the adapter; review distribution obligations before a closed-source distribution.
