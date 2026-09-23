# PHASES.md — Autonomous Master Build, Phase 00 through Phase 14

Phases are execution checkpoints, not owner approval gates.

| Phase | Name | Outcome |
|---:|---|---|
| 00 | Monorepo Integration & Ground Rules | Safe Studio boundary |
| 01 | Application Foundation | Next.js/FastAPI/PostgreSQL/Docker baseline |
| 02 | Design System & Full Studio Shell | Complete responsive shell |
| 03 | Authentication, Workspace & Settings | Private workspace + integrations dashboard |
| 04 | Secrets & Provider Configuration | Secure credential/provider layer |
| 05 | Core Domain & Project System | Projects, songs, immutable assets, lineage |
| 06 | Orchestration Kernel | Durable jobs, workers, retries, progress/recovery |
| 07 | AI Producer | Structured production plans |
| 08 | Music Generation | Provider-neutral generation + versions |
| 09 | Listening, Waveforms & A/B | Review workstation |
| 10 | Arrangement & Section Editing | Non-destructive timeline/revisions |
| 11 | Audio Analysis & Tempo/Remix | Analysis + transforms |
| 12 | Stem Separation & Mixing | Stems + mixer |
| 13 | Mastering & Export | Masters + delivery formats |
| 14 | Production Hardening & Launch | TLS, backups, monitoring, security, E2E launch |

## Execution Rule

For every dependency-ready phase/task:

`usage check → implement → test → fix → verify → document → commit → usage check → continue`

If a mechanism fails, autonomously substitute a safe architecture-preserving alternative. A localized technical issue must not idle independent work.

## Credentials

Missing provider credentials block only the live provider call requiring them. Build and verify adapters, UI, persistence, fixtures, health paths, and all unrelated phases without them. Raw secrets never enter source or browser output.

## Current Status

Phases 00–08 are verified. Phase 06 uses a restricted local OSS runtime identity;
Phase 07 has provider-neutral structured-plan adapters; and Phase 08 has a
provider-neutral durable generation contract, ElevenLabs worker adapter, bounded
leased audio intake, immutable generated assets and responsive Version A–D UI.
Fixture coverage verifies the paid-provider path without issuing a paid request.
Phase 09 is the next dependency-ready checkpoint. See the active execution record
for current evidence.

## Completion

Complete after Phase 14 production verification, or stop earlier only when the usage guard requires it or a proven external human-only blocker prevents every remaining dependency-ready task.
