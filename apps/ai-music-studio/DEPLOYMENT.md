# Studio deployment

## Current topology

The canonical checkout is `/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio`. The production-configured, isolated Compose project is `hg-studio-prod`; the development project is `hg-studio-dev`. Production private configuration, assets, credentials, and encrypted backups live under `/home/aumanah/.local/share/hg-studio/prod` (outside Git). Production web, API, and Uptime Kuma bind only to `127.0.0.1:3211`, `:8311`, and `:3212`; PostgreSQL, Windmill, dispatcher, and worker remain on the private Studio network. No Studio deployment command touches the broadcast Compose project.

The public name `studio.hungreegoat.com` points to the existing shared Hetzner nginx gateway. That gateway currently has **no Studio virtual host or certificate**, so the production URL is not yet live. This is tracked with exact access evidence in `docs/HUMAN_BLOCKERS.md`. A narrow Studio-only nginx/SSH-tunnel installation is prepared in `infra/gateway/`; do not change existing gateway vhosts or the broadcast tunnel. The former Caddy plan is superseded by the gateway's actual nginx installation (ADR-027).

## Isolated rollout

Use `STUDIO_COMPOSE_ENV_FILE=/home/aumanah/.local/share/hg-studio/prod/.env` for every production command. `scripts/compose.sh` rejects missing or relative environment files. Secrets and generated audio must never be copied into the Git checkout.

1. Run `python3 scripts/bootstrap-production.py` only if production configuration has not yet been initialized. Never overwrite existing credentials.
2. Validate `bash scripts/compose.sh --profile monitoring config --quiet` with the production environment variable set.
3. Run `bash scripts/compose.sh --profile monitoring up -d --build` in the isolated project. The migration service applies Alembic before API startup. Do not use `down -v`.
4. Run `scripts/provision-owner.py`, `scripts/provision-orchestration.py`, and `scripts/provision-uptime-kuma.mjs` with the production environment variable set. The Kuma provisioner also requires a local Playwright Chromium executable if its default browser is absent. Private generated credentials remain mode 0600 outside Git.
5. Run `python3 scripts/monitor-studio.py`, `python3 scripts/check-production-local.py --restart`, `python3 scripts/test-gateway-config.py`, and the encrypted backup/restore services. The production smoke creates its own clearly named project and never modifies existing songs.
6. When a privileged gateway operator installs the separate Studio tunnel identity and Studio-only vhost/certificate using `infra/gateway/README.md`, switch the monitor service to require `--public`, verify HTTPS/session cookies/audio range requests and all major browser routes, then recheck existing Home, Player, Control, DJ, and broadcast services.

## Backups and recovery

User systemd timers in `infra/systemd/` run local health checks every two minutes, encrypted backups daily, checksum-verified off-host copies later each night, and isolated restore checks monthly. The backup includes both PostgreSQL databases, assets, private Studio secrets/orchestration files, and the Kuma SQLite configuration. `scripts/backup-studio.py verify --restore-test` restores both PostgreSQL archives into disposable databases and the Kuma dump into disposable in-memory SQLite; it never restores over production data. `scripts/offsite-backup.py` copies only complete encrypted artifacts to a private `hermes-ro` directory on the separate gateway host, without remote deletion or service changes; a local receipt drives a 36-hour off-site freshness check. The passphrase file is not included in either copy and still needs an independent off-host escrow before full host-loss recovery is possible.

To restore an actual incident, stop only Studio writers, select a verified backup, preserve the current Studio volumes as a rollback copy, restore into fresh Studio-only volumes/directories, run Alembic and integrity checks, then point only the Studio project at the recovered data. Do not restore into or restart sibling application volumes.
