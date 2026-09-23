# Master Build Phases

Build one phase at a time.

| Phase | Name | Outcome |
|---:|---|---|
| 00 | Monorepo Integration | Boundaries, workspace plan, no nested repo |
| 01 | Infrastructure Foundation | Next.js, FastAPI, PostgreSQL, Docker baseline |
| 02 | shadcn Product Shell | Navigation, tokens, responsive screen skeletons |
| 03 | Domain & Persistence | Projects, songs, assets, jobs, provider config |
| 04 | Orchestration Kernel | Windmill, tagged workers, durable progress/retry |
| 05 | AI Producer | Prompt → structured production plan |
| 06 | Music Generation | Provider abstraction + ElevenLabs integration |
| 07 | Review & Arrangement | Waveform, A/B, approval, arrangement versions |
| 08 | Tempo / Remix | librosa analysis + Rubber Band transforms |
| 09 | Stems | Demucs adapter + stem UI |
| 10 | Mastering & Export | Matchering + FFmpeg export |
| 11 | Library & Settings | Asset discovery, provider health, defaults |
| 12 | Production Hardening | Auth, Caddy, backups, monitoring, production URL |

Detailed phase specs live in `docs/phases/`.

A phase is complete only when behavior, persistence, recovery, error handling, tests, and documentation satisfy acceptance criteria.
