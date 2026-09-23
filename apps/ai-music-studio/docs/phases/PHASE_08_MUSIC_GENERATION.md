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
