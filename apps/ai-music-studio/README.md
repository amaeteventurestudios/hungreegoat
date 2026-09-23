# Hungree Goat AI Music Studio

Self-hosted AI music production and orchestration inside the Hungree Goat monorepo.

- Production: `https://studio.hungreegoat.com`
- Source: `apps/ai-music-studio/`
- GitHub: `amaeteventurestudios/hungreegoat`

## What It Does
AI Music Studio combines AI-assisted production planning, music generation, version comparison, arrangement editing, tempo/pitch transformation, stem separation, mastering, project/version management, and final export.

It orchestrates mature engines rather than rebuilding them.

## Core Stack
- Next.js / React / TypeScript
- shadcn/ui + Base UI + Tailwind
- FastAPI
- PostgreSQL
- Windmill
- ElevenLabs Music adapter
- OpenAI / Claude adapters
- FFmpeg
- librosa / SoundFile
- Rubber Band
- Demucs
- Matchering
- Docker Compose
- Caddy

## Start Here
Codex should read:
1. `AGENTS.md`
2. `CODEX.md`
3. `MONOREPO_LAYOUT.md`
4. `ARCHITECTURE.md`
5. `PRODUCT_SPEC.md`
6. `PHASES.md`

Read `AUTONOMOUS_EXECUTION.md` and execute phases continuously in dependency order.

This directory is part of the parent Hungree Goat repository. It must not contain a nested Git repository.

## Implementation status
Phase 00 is complete. Phase 01 introduces the local web/API/PostgreSQL foundation.
The autonomous build continues through Phase 14; current checkpoint evidence is
in [the execution plan](docs/exec-plans/active/autonomous-01-14.md).

See [local development](docs/LOCAL_DEVELOPMENT.md) to start the isolated Studio
stack, and [human blockers](docs/HUMAN_BLOCKERS.md) for public gateway access.
The production URL is the target surface, not a claim of a completed launch.
