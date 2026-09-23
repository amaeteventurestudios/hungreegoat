# Operations

## Monitor
- Studio web
- Studio API
- PostgreSQL
- Windmill
- worker health
- storage free space
- TLS
- provider health

## Uptime Kuma
Add monitors for:
- `https://studio.hungreegoat.com`
- Studio API health
- selected internal checks where useful

## Logging
Structured logs should include:
- request ID
- job ID
- project/song IDs where appropriate
- worker type
- provider/engine
- duration
- terminal state

## Backups
At minimum:
- nightly PostgreSQL backup
- Studio asset backup
- secure configuration backup
- periodic restore test

## Disk
Track storage used by:
- source assets
- generations
- tempo variants
- stems
- masters
- exports
- temporary workspaces

Do not auto-delete user assets in V1.

## Failure Recovery
Browser closes:
- jobs continue

API restarts:
- domain state survives

Worker restarts:
- Windmill handles retry/requeue according to workflow

Provider outage:
- persist a clear retryable failure

Partial files:
- keep in temporary workspace
- promote only verified complete outputs

## Existing Hungree Goat Services
Studio operations and monitoring are additive. Do not alter the established broadcast monitoring stack unless a later integration explicitly requires it.
