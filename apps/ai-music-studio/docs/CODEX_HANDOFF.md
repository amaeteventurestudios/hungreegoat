# Codex Handoff — 2026-09-23

## Current State

- Model / effort: Terra High.
- Usage: weekly 12% used / 88% remaining at the last live guard; check again before the next batch.
- Current phase: 10 — Arrangement and Section Editing.
- Last committed Studio checkpoint before Phase 09: `a0a157b feat(studio): add durable music generation`.

## Completed

- Phases 00–05 are verified and committed.
- Phase 06 durable orchestration is committed in `ebd0b28`: migration `0005_orchestration`, attempts/outbox, dispatcher, internal worker routes, immutable events, retry/cancel/recovery behavior, fixed `system.verify` diagnostic, tagged worker package, and job activity UI.
- The pinned source-built Windmill image is `hg-studio-windmill:1.817.0-source`. The provisioner creates workspace `studio`, installs `f/studio/execute`, saves its hash, and removes the temporary bootstrap superadmin from runtime.
- Phase 06 is complete: the identity substitution provisions a non-admin, non-service-account workspace identity in the Studio-owned Windmill database, creates an expiring hash-only workspace-pinned exact-scope token, grants read-only RLS visibility to the fixed script, and allowlists `studio-ai`. It never creates a password or uses a superadmin runtime token.
- Real restricted-identity diagnostics succeeded through the tagged worker. An active worker was then force-killed in the local Studio stack; its expired lease reconciled safely to retryable `worker_lease_expired` without duplicate dispatch. The normal Compose restart path was also verified to preserve a graceful in-flight diagnostic.
- Final Phase 06 gates: API 43 tests, worker 5 tests, full browser regression 92 tests, lint, typecheck, production build, Compose validation, API/PostgreSQL restart recovery, and boundary check all pass.
- Phase 07 is complete: `producer.plan` is durable and idempotent; its worker adapters use provider-specific structured-output requests while the Studio validates one canonical schema and atomically versions plans. The Producer UI creates plans from selected-song context and displays the active plan. Fixture validation: API 45 tests, worker 8 tests, production build, and a live no-credential browser flow pass. No paid provider request was attempted.
- Phase 08 is complete: `music.generate` creates a durable provider-neutral Generation with one to four immutable `GenerationVersion` outputs. The ElevenLabs adapter runs only in the leased worker, saves validated audio through a bounded authenticated intake endpoint, and records provider request IDs without exposing credentials. Ambiguous provider outcomes are non-retryable; ordinary safe retries resume committed outputs. Local migration `0006_music_generation` applied successfully. Verification: API 46 tests, worker 10 tests, lint/typecheck/build, and the 100-test responsive browser regression. No paid provider request was made.
- Phase 09 is complete: authenticated WaveSurfer A/B waveform playback and seeking, position-preserving exclusive switching, persistent favorite/notes/approve/reject review, provider metadata, and an explicit Generate-more link. Migration `0007_review_rejection` adds a mutually exclusive rejection decision. API 46 tests, web lint/typecheck/build, real migration check, four-viewport targeted browser playback/review, and the full 104-test browser regression pass.

## Runtime

- `studio-api`, `studio-web`, `studio-postgres`, `studio-windmill-postgres`, and `studio-windmill` are running. The migration service exited successfully.
- `studio-worker` and `studio-dispatcher` are running and healthy.
- Private orchestration files are outside Git at `/home/aumanah/.local/share/hg-studio/dev/orchestration`; `script-hash` and `windmill-token` are populated mode 0600. Never print their values.

## Current Technical Position

Pinned Windmill OSS v1.817.0 rejects ordinary-user creation through its documented CLI/UI endpoint. This is resolved by the narrowly scoped local database bootstrap described above. Phase 10 can build on immutable generation/version assets and existing `Arrangement` domain tables; live paid-provider generation remains separately dependent on configured provider credentials.

## Protected Unrelated Work

- Modified: `apps/control/hgc/dj_orchestrator.py`.
- Untracked root files: `docs/YOUTUBE_OAUTH_HANDOFF.md` and `docs/images/{for-businesses-reference-page.png,hungree-goat-business-og.webp,menu-bar.png}`.
- Never reset, clean, stage, or commit these paths.

## Resume

1. Run `/home/aumanah/.local/bin/codex-usage-guard` and print the normalized usage line.
2. Read `docs/phases/PHASE_10_ARRANGEMENT.md` and current execution-plan records.
3. Implement the next dependency-ready Phase 10 slice; keep arrangement revisions non-destructive and use deterministic fixtures where external engines are unavailable.
