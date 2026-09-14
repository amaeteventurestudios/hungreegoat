# Deployment
## Pi (control + broadcast)
`infra/pi/deploy.sh` rsyncs `apps/control`, `infra/pi/{bin,liquidsoap}` and `infra/systemd` to `aumanah@pi-node-01`
and restarts the control service. Restart the engine after a `station.liq` change:
`systemctl --user restart hungree-goat-liquidsoap@lofi`. First-time setup and daily operations: `infra/pi/RUNBOOK.md`.

## Public apps (Vercel)
Two Vercel projects from this repo (root directory `apps/website` and `apps/player`; framework "Other").
Build command and output are in each `vercel.json` (`node ../../packages/shared/build.mjs <app>` → `dist`).
Environment variables per project: `HG_API_BASE=https://api.hungreegoat.com`, `HG_PLAYER_URL=https://player.hungreegoat.com`,
`HG_HOME_URL=https://hungreegoat.com`, optional `HG_YOUTUBE_URL` (else taken live from the API).
Domains: website → `hungreegoat.com` + `www.hungreegoat.com` (redirect to apex); player → `player.hungreegoat.com`.
Assets are content-hashed (`?v=`), HTML is `must-revalidate`, `/assets/*` immutable — no stale-bundle problem.

## Gateway (Hetzner 65.21.7.133, nginx + certbot)
1. On the Pi: `infra/gateway/install-pi.sh` (already done — public key in `infra/gateway/tunnel/hg-tunnel.pub`).
2. Create DNS A records for `api.` and `dashboard.` → 65.21.7.133.
3. On the gateway as root: `infra/gateway/install-hetzner.sh` (creates `hgtunnel`, installs the two vhosts, certbot).
4. Verify: `curl https://api.hungreegoat.com/v1/live`; open `https://dashboard.hungreegoat.com` → login page.
