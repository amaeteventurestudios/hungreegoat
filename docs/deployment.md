# Deployment
## Current production (Beelink / Docker)
See `infra/beelink/README.md` for the full picture (Dockerfile, run scripts, systemd
units) and the root `README.md`'s "Installing on a New Computer" section for the step-by-
step path. In short: `apps/control` is bind-mounted into a container built from
`infra/beelink/Dockerfile`; `infra/beelink/systemd/*.service` (portable, `systemctl --user`)
drive the control app, Liquidsoap, the video stream, and the reverse tunnel as four
independent units — restarting one never touches the others. Restart the engine after a
`station.liq` change: `systemctl --user restart hungree-goat-liquidsoap@lofi`.

Static frontend (`apps/control/static/*`) and Python (`apps/control/hgc/*.py`) are both
bind-mounted and picked up live — static assets on the next request, Python on the next
`systemctl --user restart hungree-goat-control` (it's loaded once into the long-running
process). **The one exception** is a `requirements.txt` change (currently only needed for the
optional YouTube OAuth feature, `docs/youtube-oauth.md`) — that requires rebuilding the image
first: `docker build -f infra/beelink/Dockerfile -t hungree-goat/hgc:latest infra/beelink/`,
*then* restarting `hungree-goat-control`. Rebuilding the image never touches the already-running
video-stream container, which keeps using its already-loaded image until it's itself restarted.

## Pi (legacy / rollback target — not current production)
`infra/pi/deploy.sh` rsyncs `apps/control`, `infra/pi/{bin,liquidsoap}` and `infra/systemd` to `aumanah@pi-node-01`
and restarts the control service (bare-metal venv, not Docker). Kept working and documented specifically so the
original Pi deployment remains a real rollback option. First-time setup and daily operations: `infra/pi/RUNBOOK.md`.

## Public apps (Vercel)
Until `api.hungreegoat.com` exists (gateway + DNS), the deployed site and player cannot reach the broadcast core and show their offline states; audio only works once the API is public.
Two Vercel projects from this repo (root directory `apps/website` and `apps/player`; framework "Other").
Build command and output are in each `vercel.json` (`node ../../packages/shared/build.mjs <app>` → `dist`).
Website env: `HG_API_BASE`, `HG_PLAYER_URL`, `HG_HOME_URL`, optional `HG_YOUTUBE_URL` and `HG_X_URL` (the site links only to YouTube and X; the X link stays hidden until this is set). Player (Vite) env: `VITE_HG_API_BASE`, `VITE_HG_HOME_URL`, optional `VITE_HG_YOUTUBE_URL` — defaults point at the production hostnames.
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
- **Read-only admin access** (`hermes-ro`, no sudo beyond `docker ps`/`docker compose ls`) is
  meant to be reached as `ssh hetzner-usg` — the local `~/.ssh/config.d/` alias on the Beelink
  had drifted after this migration (still pointing at the retired 65.21.7.133) and was
  corrected 2026-09-21. If `ssh hetzner-usg` ever times out again, check that alias against
  `hcloud server list` before assuming the host itself is down.
- **Semantic broadcast health**: `https://api.hungreegoat.com/v1/health/broadcast?station=<sid>`
  (see `docs/monitoring-alerts.md`) — proxied the same way as the rest of `/v1/*`, no gateway
  changes needed for it.
