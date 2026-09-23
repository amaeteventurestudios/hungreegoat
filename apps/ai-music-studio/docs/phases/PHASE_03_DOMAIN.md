# Phase 03 — Identity, Settings, Secrets & Integrations

## Objective
Build private Studio access plus first-class provider configuration before provider-dependent features.

## Work
- authentication/session foundation
- workspace settings
- Settings → Integrations dashboard
- SecretStore abstraction
- provider configuration model/API
- ElevenLabs card
- OpenAI card
- OpenRouter card
- Anthropic/Claude card
- masked credentials
- add/replace/delete credential
- enable/disable
- default model selection
- provider health/test connection
- audio/export defaults
- engine health cards for Rubber Band, Demucs, Matchering

## Rules
No hardcoded provider API keys. Missing credentials are recorded as human blockers but do not stop unrelated work.

## Acceptance
Codex verifies secret redaction, settings persistence, health paths, auth boundaries, and UI behavior, then continues automatically.
