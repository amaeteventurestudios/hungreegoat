# Hungree Goat AI Music Studio

Self-hosted AI music production and orchestration inside the Hungree Goat monorepo.

- Production: `https://studio.hungreegoat.com`
- Source: `apps/ai-music-studio/`
- GitHub: `amaeteventurestudios/hungreegoat`

## Read This First — Autonomous Engineering Contract

This project is built in **owner-independent engineering mode**.

Inside the Studio boundary, Codex/Terra is explicitly authorized to **decide and act without asking the owner for technical permission**.

It may autonomously:
- create, edit, move, rename, and delete Studio files
- refactor Studio code and architecture
- install/remove/update/downgrade Studio dependencies
- change Docker/Compose and Studio-specific runtime configuration
- create and run migrations
- create/configure Studio-local identities, tokens, users, workers, services, and databases when credentials/permissions are available
- start/restart/recreate Studio-specific containers and services
- replace a broken implementation path with a supported architecture-preserving alternative
- change an OSS component version when needed
- choose libraries, packages, implementation details, schemas, endpoints, and internal interfaces
- run tests, browser tests, diagnostics, research, builds, migrations, and repair loops
- commit coherent Studio-scoped work
- continue from phase to phase without owner approval

**Do not ask Amaete for technical decisions, approval to continue, debugging direction, dependency choices, architecture substitutions, file operations, supported upgrades/downgrades, or routine administrative actions that Codex can perform itself.**

The operating loop is:

`inspect → decide → implement → test → fix → substitute if needed → verify → document → commit → continue`

If the original approach fails, do not stop. Find and implement the safest supported alternative that preserves product requirements, security properties, data integrity, and the protected Hungree Goat boundaries.

## What Actually Justifies Interrupting the Owner

Only:
1. a **proven external human-only action** that Codex literally cannot perform, after exhausting autonomous alternatives; or
2. the mandatory Codex usage-safety stop defined in `USAGE_GUARD.md`.

Examples of true human-only actions: inaccessible MFA/2FA, CAPTCHA, payment authorization, legal/terms acceptance, inaccessible email verification, or an external credential/control surface that is genuinely unavailable to the session.

A technical error, API failure, OSS limitation, admin task, version mismatch, missing local user, failed CLI command, or architecture change is **not** a human blocker by itself.

## Protected Boundary

The Studio has broad autonomy inside `apps/ai-music-studio/`.

Do not reset, clean, overwrite, stage, commit, or disrupt unrelated work in:
- `apps/control/`
- `apps/player/`
- `apps/dj-studio/`
- the existing broadcast stack
- unrelated root files

If a cross-app change is truly required, make the minimum safe change and verify the affected production service.

## Mandatory Read Order

Every fresh or resumed Codex session must read:

1. `README.md`
2. `AGENTS.md`
3. `AUTONOMOUS_EXECUTION.md`
4. `MODEL_ROUTING.md`
5. `USAGE_GUARD.md`
6. `CODEX.md`
7. `PHASES.md`
8. `docs/CODEX_HANDOFF.md`
9. `docs/HUMAN_BLOCKERS.md`
10. current phase and execution-plan records

If older text conflicts with this autonomy contract, the stricter **do-not-interrupt-the-owner / exhaust-automation-first** rule wins.

## Product

`Idea → AI Producer → Music Generation → Version Review → Arrangement → Tempo/Pitch → Stems → Mastering → Exports`

Core stack: Next.js, React, TypeScript, shadcn/ui, FastAPI, PostgreSQL, Windmill, ElevenLabs, OpenAI/OpenRouter/Anthropic adapters, FFmpeg, librosa, SoundFile, Rubber Band, Demucs, Matchering, Docker Compose, and Caddy.

This directory is part of the parent Hungree Goat repository. It must not contain a nested Git repository.
