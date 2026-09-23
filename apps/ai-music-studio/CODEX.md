# CODEX.md — AI Music Studio Engineering Handbook

## Operating Mode
This is an autonomous end-to-end build.

Read:
1. `AUTONOMOUS_EXECUTION.md`
2. `MODEL_ROUTING.md`
3. `PHASES.md`

Execute Phase 00 through Phase 14 continuously.

## Model Policy
Default coordinator: **Sol Medium**.

Route implementation work as follows:
- Luna Low/Medium → scans, discovery, repetitive checks, mechanical edits
- Terra Medium → normal React, FastAPI, PostgreSQL, Docker, tests
- Terra High → complex implementation, Windmill/runtime work, difficult debugging, interrupted-work recovery
- Sol Low/Medium → architecture-sensitive coding, review, integration, hard unresolved issues
- Astra → exceptional architecture/reasoning escalation only

Explicitly set child model + reasoning effort when delegating. Do not rely on inheritance.

## Current Recovery State
The previous run stopped because usage was exhausted during Windmill/worker runtime integration. If resuming that work, Terra High should first reconstruct state from git diff, execution records, running/background processes, and logs, then continue from the existing partial implementation.

Do not restart the project and do not redo completed work.

## Repository Context
- Git root: `/home/aumanah/hungree-goat-src/hungreegoat-canonical`
- Studio root: `/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio`
- Runtime tree: `/home/aumanah/hungree-goat`
- Production: `https://studio.hungreegoat.com`
- GitHub: `amaeteventurestudios/hungreegoat`

## Product Goal
Create a production workstation, not a chatbot.

## Principle
Build the orchestration layer, not the engines.

## Required Abstractions
- `AIProducerProvider`
- `MusicGenerationProvider`
- `AudioAnalyzer`
- `TempoProcessor`
- `StemSeparator`
- `MasteringProvider`
- `StorageProvider`
- `OrchestrationClient`
- `SecretStore`

## Execution Discipline
For each phase:
1. inspect state
2. update execution plan
3. delegate independent work to appropriately routed workers
4. implement
5. test
6. fix
7. visually verify UI where relevant
8. update docs
9. commit Studio-scoped work when appropriate
10. immediately continue

Do not pause for owner confirmation.

## Success Definition
The run ends only after Phase 14 and one consolidated final report, unless every remaining independent task is blocked by a true human-only blocker.
