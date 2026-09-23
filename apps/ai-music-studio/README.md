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

Then execute one phase at a time.

This directory is part of the parent Hungree Goat repository. It must not contain a nested Git repository.
