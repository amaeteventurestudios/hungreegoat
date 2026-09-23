# PHASES.md — Autonomous Master Build, Phase 00 through Phase 14

Phases are execution checkpoints, **not owner approval gates**.

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

Do not ask the owner between phases.

If a planned mechanism fails, autonomously substitute a supported architecture-preserving alternative and continue.

If one phase has a localized unresolved technical issue, continue independent dependency-ready work rather than idling the entire build.

## Credentials

Missing provider credentials block only the live provider call that requires them. Build adapters, UI, persistence, mocks/fixtures, health paths, tests, and all unrelated phases anyway.

## Completion

Complete after Phase 14 production verification, or stop earlier only because the usage guard requires it or a proven external human-only blocker prevents every remaining dependency-ready task.
