# AGENTS.md — Hungree Goat AI Music Studio

## Scope
This file governs work inside `apps/ai-music-studio/`.

AI Music Studio is a first-class application inside the existing Hungree Goat monorepo.

- GitHub: `amaeteventurestudios/hungreegoat`
- Canonical checkout: `/home/aumanah/hungree-goat-src/hungreegoat-canonical`
- Studio source root: `/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio`
- Runtime/deployment tree: `/home/aumanah/hungree-goat`
- Production URL: `https://studio.hungreegoat.com`

## Autonomous Mandate
Read `AUTONOMOUS_EXECUTION.md` before doing work.

Codex is authorized to execute Phase 00 through Phase 14 continuously without routine owner confirmation. Research, decide, install, implement, test, repair, verify, document, and continue autonomously.

Do not stop between phases. Intermediate phase completion is an internal checkpoint only.

Before Phase 14 is complete, do not:
- return a phase-complete summary and wait
- ask for a next-phase prompt
- recommend a next-phase prompt
- wait for owner approval to continue
- stop after committing or writing an execution record

Continue directly into the next dependency-ready phase.

Only true human-only blockers may interrupt completion. Record those in `docs/HUMAN_BLOCKERS.md`, continue all independent work, and consolidate remaining owner actions into one final handoff.

## Hard Boundary
By default, do not modify:
- `apps/control/`
- `apps/player/`
- `apps/dj-studio/`
- existing broadcast services
- existing root deployment behavior

Only touch sibling applications when an explicit cross-app integration requires it and the execution plan documents the exact impact.

Do not create a nested `.git`. Studio belongs to the parent Hungree Goat repository.

## Mission
Build a self-hosted browser-based AI music production studio that orchestrates mature AI and audio engines instead of rebuilding them.

`Idea → AI Producer → Music Generation → Version Review → Arrangement → Tempo/Pitch → Stems → Mastering → Exports`

## Read First
1. `AUTONOMOUS_EXECUTION.md`
2. `CODEX.md`
3. `MONOREPO_LAYOUT.md`
4. `ARCHITECTURE.md`
5. `PRODUCT_SPEC.md`
6. `PHASES.md`
7. relevant subsystem docs
8. current phase file

## Core Stack
Frontend:
- Next.js
- React
- TypeScript
- shadcn/ui
- Base UI
- Tailwind CSS
- Lucide
- wavesurfer.js

Control plane:
- FastAPI
- Pydantic
- SQLAlchemy
- Alembic
- PostgreSQL

Orchestration:
- Windmill
- tagged workers

AI/music:
- OpenAI adapter
- OpenRouter adapter
- Anthropic/Claude adapter
- ElevenLabs Music adapter

Audio:
- FFmpeg
- librosa
- SoundFile
- Rubber Band
- Demucs behind `StemSeparator`
- Matchering behind `MasteringProvider`

Infrastructure:
- Docker Compose
- Caddy
- structured logs
- Uptime Kuma

## Architecture Laws
1. Browser code never executes server audio engines directly.
2. UI calls the Studio API.
3. API validates commands, persists domain intent, and creates jobs.
4. Windmill coordinates long-running execution.
5. PostgreSQL is canonical domain truth.
6. Windmill execution state is operational state, not project truth.
7. Providers are behind adapters.
8. Audio engines are behind adapters.
9. Never overwrite source or derived audio.
10. Every transformation creates a new immutable asset and lineage record.
11. Database records use logical asset IDs.
12. Provider-specific data must not leak into shared contracts.
13. Never construct shell commands from untrusted concatenated input.
14. Active jobs recover after browser refresh/reconnect.
15. Existing Hungree Goat apps are protected boundaries.
16. Provider credentials are never hardcoded.
17. Missing provider credentials do not block unrelated phases.

## UI Law
Use shadcn/ui wherever a suitable component exists. Custom components are reserved for waveform, A/B compare, arrangement timeline, stem mixer, tempo preview, energy curve, and mini-player.

Use Grid/Flexbox, shared tokens, consistent typography, and responsive layouts. Avoid structural absolute positioning and arbitrary fixed heights.

## Coding Rules
- TypeScript strict mode.
- Python type hints.
- No provider calls from React components.
- No business logic hidden in presentation components.
- Alembic migrations for schema changes.
- Long-running operations return job IDs.
- Jobs expose progress and terminal state.
- Prefer idempotent operations.
- Persist and surface errors.
- Do not silently swallow exceptions.

## Testing Rules
Codex owns verification. Run and fix:
- unit tests
- API tests
- workflow/job tests
- integration tests where possible
- UI/E2E tests
- visual QA
- regression tests

Do not ask the owner to manually verify anything Codex can verify itself.

## Existing-Work Protection
The checkout may contain unrelated modified/untracked files. Never reset, clean, discard, stage, or commit unrelated changes. Restrict work and staging to Studio paths unless a documented integration requires otherwise.

## Working Style
Inspect, decide, implement, test, fix, document, continue. Prefer simple reversible decisions. Never claim an integration works without verification. Never stop for routine approval.
