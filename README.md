# HUNGREE Goat — platform monorepo

**Afrobeats. Always on.** A 24/7 African music broadcast: a public homepage, a public web player and a private
operator console, all fed by one broadcast core (Liquidsoap + FFmpeg) running on a Raspberry Pi.

| Surface | Path | Hosting | Auth |
|---|---|---|---|
| Homepage `hungreegoat.com` | `apps/website` | Vercel (static) | none |
| Player `player.hungreegoat.com` | `apps/player` (Vite/React, **AGPL-3.0** — see `apps/player/NOTICE.md`) | Vercel (static, PWA-ready) | none |
| Control `control.hungreegoat.com` | `apps/control` | pi-node-01 via HTTPS gateway | operator login |
| Public API `api.hungreegoat.com` | `apps/control/hgc/public_api.py` (`/v1/*`) | pi-node-01 via gateway | none (read-only) |

```
hungreegoat.com ──┬── Listen Live ──▶ api.hungreegoat.com/v1/listen/lofi.mp3 ─┐
                  └── Watch YouTube ──▶ YouTube                               │
player.hungreegoat.com ── /v1/now-playing · up-next · schedule · stations ───┤   (public, read-only)
                                                                             ▼
                                              gateway (Hetzner nginx, TLS) ── SSH reverse tunnel ── pi-node-01
                                                                                                    ├─ HUNGREE Goat Control (FastAPI :8090)
control.hungreegoat.com ── LOGIN ── same gateway ── /api/* (private) ─────────────────────────────┤
                                                                                                    ├─ Liquidsoap 2.4.5 (Docker) ── AAC/MP3 mounts
                                                                                                    └─ FFmpeg (h264_v4l2m2m) ── RTMPS ── YouTube
```

## Layout
```
apps/website   public one-page site (src/ → dist/ via packages/shared/build.mjs)
apps/player    public player (PWA manifest, Media Session)
apps/control   HUNGREE Goat Control backend (FastAPI) + operator SPA
packages/brand tokens.css, fonts, canonical brand/lifestyle assets
packages/ui    shared public UI primitives (hg-ui.css)
packages/shared hg-api.js (public API client + listener-side audio) and the static build script
infra/pi       Pi scripts, Liquidsoap station script, runbook, deploy.sh
infra/systemd  user systemd units for the Pi
infra/gateway  nginx vhosts + restricted SSH tunnel for api./control.
docs/          architecture, deployment, development, DNS, security, API
```

## Quick start
- Public apps: `cd apps/website && npm run dev` (or `player`). Env: `HG_API_BASE`, `HG_YOUTUBE_URL`, `HG_PLAYER_URL`, `HG_HOME_URL`.
- Control to the Pi: `infra/pi/deploy.sh` (rsync, no root). Runbook: `infra/pi/RUNBOOK.md`.
- Gateway: `infra/gateway/install-hetzner.sh` on the gateway, `infra/gateway/install-pi.sh` on the Pi.

Secrets never live in this repo — see `apps/control/secrets.example.md` and `docs/security.md`.
