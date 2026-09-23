# Human Blockers

This file is the single collection point for actions that truly require the owner.

Codex must not use this file for routine questions, design decisions, debugging, package choices, testing, or implementation uncertainty.

## Current Blockers
## Public gateway ingress (confirmed 2026-09-23)
DNS for `studio.hungreegoat.com` already points to gateway `2.29.28.125`, but
HTTPS returns TLS `unrecognized name`: nginx has no Studio vhost. Available SSH
identity `hermes-ro` permits read-only inspection and Docker listing only, with
no nginx configuration write or reload permission. Existing tunnel authorization
is restricted to Control's port 18090 and must remain untouched.

Gateway administrator action: install a dedicated Studio TLS vhost and authorize
a new dedicated reverse-tunnel key/listen port (proposed gateway 18310 → local
Studio Caddy 8410). Phase 14 will provide concrete configuration/install artifacts.
No DNS change is currently needed. Local deployment, tests, backups, audio engine
verification, and hardening remain independent and continue.

## Provider credentials (confirmed 2026-09-23)
The Studio has no configured provider credentials, and this session has no
OpenAI, OpenRouter, Anthropic or ElevenLabs API key environment variables.
An owner with the relevant accounts must add keys in Settings → Integrations
and verify account permissions/quota. A credential from an unrelated application
is not assumed available for this Studio. Adapter contract tests and all local
audio workflows continue independently; paid provider success cannot be claimed
until valid credentials permit a real invocation.


## Allowed Blocker Categories
- provider account/API credential unavailable
- payment/subscription
- MFA/2FA
- CAPTCHA
- email verification
- legal/terms acceptance
- unavailable private reference asset
- unavailable authorized DNS/registrar action
- destructive production action outside Studio scope requiring owner authorization

## Rule
Continue all independent work before stopping. Consolidate human-only actions here and present them together at the end whenever possible.
