# Hungree Goat AI Music Studio

Self-hosted AI music production and orchestration inside the Hungree Goat monorepo.

- Production: `https://studio.hungreegoat.com`
- Source: `apps/ai-music-studio/`
- GitHub: `amaeteventurestudios/hungreegoat`

## Autonomous Engineering Contract

This project operates in owner-independent engineering mode. Within the Studio boundary, Codex/Terra may decide and act without owner approval: edit Studio source and configuration, operate Studio services, change dependencies and internal architecture, run migrations/tests, document and commit coherent Studio work, and continue through dependency-ready phases.

When a planned mechanism fails, use the safest supported substitution that preserves product requirements, security, data integrity, and the protected Hungree Goat boundary. Technical failures, OSS limitations, API failures, and missing local identities are not human blockers by themselves.

The operating loop is:

`inspect → decide → implement → test → fix → substitute if needed → verify → document → commit → continue`

Only a proven external human-only action or the mandatory stop in `USAGE_GUARD.md` justifies interruption.

## Protected Boundary

Do not reset, clean, overwrite, stage, commit, or disrupt unrelated work in `apps/control/`, `apps/player/`, `apps/dj-studio/`, the existing broadcast stack, or unrelated root files. Make any necessary cross-app change as narrowly as possible and verify the affected service.

## Mandatory Read Order

1. `README.md`
2. `AGENTS.md`
3. `AUTONOMOUS_EXECUTION.md`
4. `MODEL_ROUTING.md`
5. `USAGE_GUARD.md`
6. `CODEX.md`
7. `PHASES.md`
8. `DECISIONS.md`
9. `docs/CODEX_HANDOFF.md`
10. `docs/HUMAN_BLOCKERS.md`
11. current phase and execution-plan records

## Product

`Idea → AI Producer → Music Generation → Version Review → Arrangement → Tempo/Pitch → Stems → Mastering → Exports`

Core stack: Next.js, React, TypeScript, shadcn/ui, FastAPI, PostgreSQL, Windmill, provider adapters, FFmpeg, librosa, SoundFile, Rubber Band, Demucs, Matchering, Docker Compose, and Caddy.

The current phase checkpoint and acceptance evidence are in `docs/exec-plans/active/autonomous-01-14.md`.
