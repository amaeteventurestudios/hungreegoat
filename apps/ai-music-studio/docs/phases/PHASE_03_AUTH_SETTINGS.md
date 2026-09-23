# Phase 03 — Authentication, Workspace and Settings Foundation

## Objective
Build private Studio access and a first-class Settings experience.

## Work
- Studio login
- private workspace
- user/session handling
- secure settings area
- workspace preferences
- appearance preferences
- default audio settings
- default export settings

## Integrations Dashboard
Settings must include:
- Integrations
  - ElevenLabs
  - OpenAI
  - OpenRouter
  - Anthropic/Claude
  - future providers
- Audio Engines
  - Rubber Band
  - Demucs
  - Matchering
- Storage
- Audio Defaults
- Exports

Each provider card shows:
- Connected / Not Connected
- API key status
- masked key
- last updated
- provider/model selection
- Test Connection
- last successful test
- rate-limit/status information where available
- Save
- Replace key
- Disable provider

## Acceptance
A secure visual provider/settings dashboard exists and no provider key is hardcoded.
