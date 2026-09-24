# Operations

## Monitor

`STUDIO_COMPOSE_ENV_FILE=/home/aumanah/.local/share/hg-studio/prod/.env python3 scripts/monitor-studio.py` checks isolated container health, loopback web/API/Kuma, worker ping recency, enabled-provider state, free storage, and local/off-site encrypted-backup age. `--public` also requires the production HTTPS endpoint; enable it in the timer after the gateway route is live. The user-level `studio-monitor.timer` runs every two minutes. A nonzero result is a degraded health signal; inspect its JSON and Studio-only logs before restarting a service.

## Uptime Kuma

The `monitoring` Compose profile runs pinned Uptime Kuma 2.5.5 on loopback `127.0.0.1:3212`, without Docker-socket access. `scripts/provision-uptime-kuma.mjs` provisions a private admin and four HTTP monitors through the UI: internal Studio web, API readiness, Windmill version, and public HTTPS readiness. The first three are UP locally. The public check remains DOWN until the gateway certificate/vhost is installed. The private password file and Kuma SQLite configuration are included in production credential/backup handling, respectively. Do not publish the admin console unauthenticated.

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

`studio-backup.timer` encrypts two PostgreSQL custom dumps, assets, Studio secrets/orchestration files, and Kuma configuration daily with GPG AES-256. `studio-offsite-backup.timer` transfers the newest complete encrypted set to a private directory on the separate gateway host and checks every artifact digest without deleting older copies; it refuses a transfer that would leave less than 5 GiB free on that shared host. `studio-restore-check.timer` verifies checksums/decryption and restores both databases into disposable databases plus Kuma into disposable SQLite monthly. Run the three systemd services manually after a storage or migration change. The passphrase must be escrowed separately from both hosts; the off-site encrypted copy alone cannot be decrypted after total local-host loss. See `DEPLOYMENT.md`.

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
