# AGENTS.md — Hungree Goat AI Music Studio

## Scope
This file governs work inside `apps/ai-music-studio/`.

AI Music Studio is a first-class application inside the existing Hungree Goat monorepo.

- GitHub: `amaeteventurestudios/hungreegoat`
- Canonical checkout: `/home/aumanah/hungree-goat-src/hungreegoat-canonical`
- Studio source root: `/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio`
- Runtime/deployment tree: `/home/aumanah/hungree-goat`
- Production URL: `https://studio.hungreegoat.com`

## Hard Boundary
By default, do not modify:
- `apps/control/`
- `apps/player/`
- `apps/dj-studio/`
- existing broadcast services
- existing root deployment behavior

Only touch sibling applications when the active task explicitly requires cross-app integration and the execution plan names the exact impact.

Do not create a nested `.git` directory. The Studio belongs to the parent Hungree Goat repository.

## Mission
Build a self-hosted browser-based AI music production studio that orchestrates mature AI and audio engines instead of rebuilding them.

Core journey:
`Idea → AI Producer → Music Generation → Version Review → Arrangement → Tempo/Pitch → Stems → Mastering → Exports`

## Read First
1. `CODEX.md`
2. `MONOREPO_LAYOUT.md`
3. `ARCHITECTURE.md`
4. `PRODUCT_SPEC.md`
5. `PHASES.md`
6. active phase file in `docs/phases/`
7. relevant subsystem docs

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
- Claude adapter
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
3. The API validates commands, persists domain intent, and creates jobs.
4. Windmill coordinates long-running execution.
5. PostgreSQL is canonical domain truth.
6. Windmill execution state is operational state, not project truth.
7. External providers are behind adapters.
8. Audio engines are behind adapters.
9. Never overwrite source or derived audio.
10. Every transformation creates a new immutable asset and lineage record.
11. Database records use logical asset IDs, not arbitrary public paths.
12. Provider-specific data must not leak into shared UI/domain contracts.
13. Never construct shell commands by concatenating untrusted user input.
14. Active jobs must recover after browser refresh/reconnect.
15. Existing Hungree Goat apps are protected boundaries.

## UI Law
Use shadcn/ui wherever a suitable component exists. Custom components are reserved for domain UI such as waveform, A/B compare, arrangement timeline, stem mixer, tempo preview, energy curve, and mini-player.

Use Grid/Flexbox, shared tokens, consistent typography, and responsive layouts. Avoid structural absolute positioning and magic fixed heights.

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
For meaningful features:
- unit tests
- API contract tests
- workflow/job tests
- integration tests where practical
- UI/E2E tests
- visual QA
- regression tests for bug fixes when practical

## Existing-Work Protection
The canonical checkout may contain unrelated modified or untracked files. Never reset, clean, discard, stage, or commit unrelated changes. Restrict work and staging to `apps/ai-music-studio/` unless the task explicitly requires otherwise.

## Working Style
Complete one phase or coherent task at a time. Inspect before editing. Prefer existing patterns. Make the simplest reversible choice. Never claim an integration works without real verification.
