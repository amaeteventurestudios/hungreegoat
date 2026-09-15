# Deployment
## Pi (control + broadcast)
`infra/pi/deploy.sh` rsyncs `apps/control`, `infra/pi/{bin,liquidsoap}` and `infra/systemd` to `aumanah@pi-node-01`
and restarts the control service. Restart the engine after a `station.liq` change:
`systemctl --user restart hungree-goat-liquidsoap@lofi`. First-time setup and daily operations: `infra/pi/RUNBOOK.md`.

## Public apps (Vercel)
Until `api.hungreegoat.com` exists (gateway + DNS), the deployed site and player cannot reach the broadcast core and show their offline states; audio only works once the API is public.
Two Vercel projects from this repo (root directory `apps/website` and `apps/player`; framework "Other").
Build command and output are in each `vercel.json` (`node ../../packages/shared/build.mjs <app>` → `dist`).
Website env: `HG_API_BASE`, `HG_PLAYER_URL`, `HG_HOME_URL`, optional `HG_YOUTUBE_URL`. Player (Vite) env: `VITE_HG_API_BASE`, `VITE_HG_HOME_URL`, optional `VITE_HG_YOUTUBE_URL` — defaults point at the production hostnames.
Domains: website → `hungreegoat.com` + `www.hungreegoat.com` (redirect to apex); player → `player.hungreegoat.com`.
Assets are content-hashed (`?v=`), HTML is `must-revalidate`, `/assets/*` immutable — no stale-bundle problem.

## Gateway (Hetzner 2.29.28.125, nginx + certbot)
The original gateway (65.21.7.133) is confirmed unreachable and has been replaced; DNS for `api.` and
`control.` now points at 2.29.28.125 (verified 2026-09-15).
1. On the Pi: `infra/gateway/install-pi.sh` (already done — public key in `infra/gateway/tunnel/hg-tunnel.pub`).
2. Create DNS A records for `api.` and `control.` → 2.29.28.125.
3. On the gateway as root: `infra/gateway/install-hetzner.sh` (creates `hgtunnel`, installs the two vhosts, certbot).
4. Verify: `curl https://api.hungreegoat.com/v1/live`; open `https://control.hungreegoat.com` → login page.
- Deployments are accepted only for commits authored by the Vercel-linked GitHub account (`amaeteventurestudios`); the repo's local git config is set to its no-reply address.
