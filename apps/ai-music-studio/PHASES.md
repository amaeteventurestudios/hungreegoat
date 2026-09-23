# Autonomous Master Build — Phase 00 through Phase 12

Codex executes these phases continuously. A phase gate is an internal verification checkpoint, not a request for owner approval.

| Phase | Name | Outcome |
|---:|---|---|
| 00 | Monorepo Reconnaissance & Integration | Safe Studio boundary, environment inventory, execution plan |
| 01 | Platform Foundation | Next.js/React/shadcn, FastAPI, PostgreSQL, Docker baseline |
| 02 | Product Shell & Design System | Complete responsive Studio shell and all primary routes |
| 03 | Identity, Settings, Secrets & Integrations | Login/workspace plus secure provider dashboard and credential management |
| 04 | Domain, Assets & Persistence | Projects, songs, immutable assets, lineage, jobs, settings data |
| 05 | Orchestration Kernel | Windmill, tagged workers, durable jobs, retries, progress, recovery |
| 06 | AI Producer | OpenAI/OpenRouter/Claude adapters and structured production plans |
| 07 | Music Generation | ElevenLabs adapter, generation batches, immutable versions |
| 08 | Review & Arrangement | Waveforms, A/B comparison, approval, arrangement revisions |
| 09 | Audio Analysis & Tempo/Remix | librosa/SoundFile/FFmpeg analysis and Rubber Band transforms |
| 10 | Stem Separation & Mixing | Demucs abstraction, stems, mixer, recombination |
| 11 | Mastering, Library & Export | Matchering, final masters, searchable library, WAV/MP3/stems exports |
| 12 | Production Hardening & Launch | Caddy/TLS, backups, monitoring, security, E2E verification, production launch |

## Continuous Execution Rule
For each phase:
1. implement
2. test
3. fix
4. verify
5. document
6. commit appropriately
7. continue

Do not wait for another owner prompt.

## Credential Independence
Missing provider credentials must not halt unrelated work. Build provider interfaces, Settings UI, secret storage, health checks, mocks/fixtures where appropriate, and continue. Record truly missing credentials in `docs/HUMAN_BLOCKERS.md`.

## Completion
The build is complete after Phase 12 when the system is production-deployed or every technically possible task is finished and only documented external human-only blockers remain.
