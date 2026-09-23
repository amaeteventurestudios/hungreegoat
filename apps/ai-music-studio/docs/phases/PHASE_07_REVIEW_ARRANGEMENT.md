# Phase 07 — Music Generation

## Objective
Generate multiple music versions through a provider-neutral generation contract.

## Work
- MusicGenerationProvider
- ElevenLabs Music adapter
- provider/model/capability configuration
- generation workflow
- Version A/B/C/D
- progress
- provider request IDs
- download/persist outputs
- immutable assets
- retry/rate-limit handling

## Missing Credential Behavior
If ElevenLabs credentials are unavailable, complete every independent implementation/test using mocks/fixtures and leave the real health/generation verification as one consolidated human blocker. Continue to Phase 08.

## Acceptance
When credentials exist, verify real generation. In all cases verify normalized contract, persistence, error handling, and UI recovery.
