# AGENTS.md — Hungree Goat AI Music Studio

## Scope
This file governs work inside `apps/ai-music-studio/`.

- GitHub: `amaeteventurestudios/hungreegoat`
- Canonical checkout: `/home/aumanah/hungree-goat-src/hungreegoat-canonical`
- Studio source root: `/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio`
- Runtime/deployment tree: `/home/aumanah/hungree-goat`
- Production URL: `https://studio.hungreegoat.com`

## Autonomous Mandate
Read `AUTONOMOUS_EXECUTION.md`, `MODEL_ROUTING.md`, and `USAGE_GUARD.md` before doing work.

Execute Phase 00 through Phase 14 continuously without routine owner confirmation, subject to the usage guard.

## No Premature Blockers
Do not call something a human blocker just because the first path failed.

Before escalation to the owner, exhaust safe documented automation paths: CLI, APIs, admin APIs already authorized, bootstrap/setup mechanisms, supported config, container/admin commands, official docs, upstream source/issues, alternate supported flows, architecture-compatible workarounds, and appropriate model escalation.

If you can perform the action with the tools/permissions available to you, it is not a human blocker.

A human-only blocker requires proof of an external action you literally cannot perform. Record that proof in `docs/HUMAN_BLOCKERS.md`.

A blocker affecting one subtask does not justify stopping unrelated independent work.

## Hard Boundary
By default, do not modify:
- `apps/control/`
- `apps/player/`
- `apps/dj-studio/`
- existing broadcast services
- unrelated root deployment behavior

Never reset, clean, discard, stage, or commit unrelated work.

## Mission
Build:
`Idea → AI Producer → Music Generation → Version Review → Arrangement → Tempo/Pitch → Stems → Mastering → Exports`

## Core Architecture Laws
- browser never executes server audio engines directly
- UI calls Studio API
- PostgreSQL is canonical domain truth
- Windmill coordinates long jobs
- providers/audio engines live behind adapters
- assets are immutable and lineage-tracked
- provider credentials are never hardcoded
- missing provider credentials do not block unrelated work
- active jobs recover after browser refresh/reconnect

## UI
Use shadcn/ui wherever suitable. Custom widgets are for domain-specific experiences such as waveform, comparison, timeline, stem mixer, tempo preview, energy curve, and mini-player.

## Testing
Codex owns unit, API, workflow, integration, UI/E2E, visual QA, and regression verification. Do not ask the owner to manually verify something Codex can verify itself.

## Working Style
Inspect, investigate, decide, implement, test, fix, document, and continue. Never stop for routine approval.
