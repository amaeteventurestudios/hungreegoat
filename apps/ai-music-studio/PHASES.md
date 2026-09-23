# Autonomous Master Build — Phase 00 through Phase 14

Codex executes these phases continuously. A phase gate is an internal verification checkpoint, not a request for owner approval.

| Phase | Name | Outcome |
|---:|---|---|
| 00 | Monorepo Integration & Ground Rules | Safe Studio boundary inside Hungree Goat |
| 01 | Application Foundation | Next.js/React/shadcn + FastAPI/PostgreSQL/Docker baseline |
| 02 | Design System & Full Studio Shell | Complete responsive Studio UI skeleton |
| 03 | Authentication, Workspace & Settings Foundation | Private workspace plus first-class Integrations dashboard |
| 04 | Secrets & Provider Configuration Layer | Secure credential storage, health checks, models, provider switching |
| 05 | Core Domain & Project System | Projects, songs, assets, lineage, jobs, provider config |
| 06 | Orchestration Kernel | Windmill, durable jobs, retries, workers, progress, recovery |
| 07 | AI Producer | OpenAI/OpenRouter/Claude → structured production plans |
| 08 | Music Generation | ElevenLabs Music adapter, generation batches, immutable versions |
| 09 | Listening, Waveforms & A/B Comparison | Review workstation, approve/reject/favorite/regenerate |
| 10 | Arrangement & Section Editing | Timeline, sections, revisions, capability-aware regeneration |
| 11 | Audio Analysis & Tempo / Remix | librosa/SoundFile/FFmpeg + Rubber Band transforms |
| 12 | Stem Separation & Mixing | Demucs abstraction, stems, mixer, recombination |
| 13 | Mastering & Export | Matchering, WAV/MP3/stems package, final masters |
| 14 | Production Hardening & Launch | Caddy/TLS, backups, monitoring, security, E2E launch |

## Continuous Execution Rule
For every phase:
1. implement
2. test
3. fix
4. verify
5. document
6. commit appropriately
7. continue immediately

Do not wait for another owner prompt between phases.

## Provider Credential Rule
No provider credential is hardcoded into source.

Settings → Integrations must support at minimum:
- ElevenLabs
- OpenAI
- OpenRouter
- Anthropic/Claude
- future providers

For each provider show:
- Connected / Not Connected
- Enabled / Disabled
- masked key
- Add / Replace / Delete key
- Test Connection
- provider/model selection
- last successful test
- health status
- quota/rate-limit/usage information when exposed by the provider API

Raw secrets must never be returned to the browser after storage.

## Completion
The build is complete after Phase 14 when production is deployed and verified, or every technically possible task is complete and only documented external human-only blockers remain.
