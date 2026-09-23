# Phase 08 — Music Generation

## Objective
Connect ElevenLabs Music behind a provider-neutral abstraction.

## Work
- MusicGenerationProvider
- ElevenLabs adapter
- provider settings
- model options
- generation count
- Version A/B/C/D
- generation queue
- progress
- failure/retry handling
- provider request IDs
- output retrieval
- immutable output assets
- metadata persistence

## Cost Rule
Use mocks/fixtures for ordinary development and only the minimum number of real paid generations required to prove integration.

## Acceptance
Production Plan → generated versions, with persistence/playback and no ElevenLabs-specific schema leaking into generic UI/domain code.

## Completion Evidence
- `MusicGenerationJobInput` and generic `Generation`/`GenerationVersion` records
  persist requested settings, immutable version assets and bounded provider request IDs.
- The ElevenLabs adapter is isolated in the worker. It sends `POST /v1/music`,
  reports sanitized failures and marks ambiguous provider outcomes non-retryable.
- A lease-bound binary intake route validates every provider response with FFprobe
  before making a private immutable asset available for playback.
- Safe retries receive the atomically committed versions and do not regenerate them.
- Fixtures: API 46 passing tests, worker 10 passing tests, lint/typecheck/build,
  and a 100-test responsive browser regression. No paid provider request was made.
