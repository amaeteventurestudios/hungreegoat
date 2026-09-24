# HUNGREE Goat Control — operations runbook (pi-node-01)

> **Media path (2026-09-24):** the shared scripts now default to the Beelink data drive, `/srv/ai-node/storage/data`. On the Raspberry Pi set `HGC_MEDIA=/media/hungree-goat` in the units/environment; the paths below describe the Pi layout.


Everything lives in `~/hungree-goat` for user `aumanah`. Nothing runs as root except the
optional USB repair helper (`/usr/local/sbin/hgc-usb-repair`, sudoers-scoped).

## Services (user systemd, linger enabled — survive reboot)
    systemctl --user status hungree-goat-control.service           # API + dashboard :8090
    systemctl --user status hungree-goat-liquidsoap@lofi.service   # audio engine (Docker savonet/liquidsoap:v2.4.5)
    systemctl --user status hungree-goat-stream@lofi.service       # FFmpeg video pipeline → YouTube
    # Afrobeats instances exist (@afrobeats) but stay off until /media/hungree-goat/music/afrobeats has media.
Logs: `journalctl --user-unit=<unit>`; Liquidsoap detail in `run/liq-<station>.log`; FFmpeg in `logs/ffmpeg-<station>.log`.

## Dashboard
http://192.168.6.235:8090  (LAN only). Operator login: user `operator`, initial password in
`secrets/operator-password.txt` (change it in Settings; the file is then deleted).

## YouTube stream keys (never in chat, never in git)
    nano ~/hungree-goat/secrets/youtube-lofi.env        # YOUTUBE_RTMPS_URL=..., YOUTUBE_STREAM_KEY=...
    chmod 600 ~/hungree-goat/secrets/youtube-lofi.env
Then Outputs → target "YouTube Live" → Restart Output (or `systemctl --user restart hungree-goat-stream@lofi`).

## Media
Music: `/media/hungree-goat/music/<station>/` · covers: `/media/hungree-goat/artwork/` (name like the track) ·
jingles/station-ids/fallback dirs as named. After adding files: Library → Rescan Media (or
`cd ~/hungree-goat/app && ../venv/bin/python -m hgc scan --loudness`).

## If the USB drive drops (dashboard shows "I/O ERROR — needs repair")
    sudo /usr/local/sbin/hgc-usb-repair      # or the "Repair drive now" button; auto-runs every 10 min while broken
It never reformats: unmount → e2fsck -fy → mount → write test → restart services.

## Update the code
Edit under the source tree, then `rsync` to `~/hungree-goat/{app,bin,liquidsoap}` and restart the unit(s).
Liquidsoap script check: `docker run --rm -v ~/hungree-goat/liquidsoap:/liq:ro --entrypoint liquidsoap savonet/liquidsoap:v2.4.5 --check /liq/station.liq`

## v2 (UI/UX + operator workflow pass)
- Frontend: `app/static/app.js` (runtime: same-origin API, DOM morphing, delegated events, Listen Live, alerts drawer, mobile nav),
  `pages.js` (all pages), `app.css` (design system). Assets are versioned (`?v=<hash of mtimes>`) and served `no-cache`;
  open tabs reload themselves within a minute of a deploy.
- Artwork: `app/static/assets/img/` — `hungree-goat-logo{,-gold,-black,-color}.png` (1024², transparent), `hungree-goat-logo.svg`
  (raster wrapper), `sidebar-art.webp` 941×1672 (+`-small`), `dashboard-hero.webp` 2508×627 (+`-mobile`),
  `default-track-art.webp` 1000² (+400 webp, +800 jpg which is synced to `/media/hungree-goat/artwork/default.jpg`).
- Listen Live: Liquidsoap MP3 128 kbps mount `/<station>-listen.mp3` on the loopback harbor, proxied at
  `GET /api/stations/<sid>/listen.mp3` (session cookie required). Same mount will feed the future public player via a
  separate authenticated/unauthenticated proxy — no Liquidsoap change needed.
- Uploads: Library → Upload Tracks (multi-file, per-file progress, duplicate detection by SHA-256/filename, clean titles,
  cover matching, loudness in background). Covers: per-track upload/auto/default, bulk cover upload.
- YouTube Setup page: key written to `secrets/youtube-<sid>.env` (0600), masked in the UI, never logged.
- Alerts: `alerts` table derived from warning/error/critical events; clearing alerts never touches `events`.

## Remote access (control.hungreegoat.com, via the Hetzner gateway reverse tunnel)
Put a TLS reverse proxy (Caddy/nginx/Cloudflare Tunnel) in front of `127.0.0.1:8090`; forward `X-Forwarded-Proto: https`
(cookies become Secure automatically; uvicorn trusts proxy headers from 127.0.0.1 only). Keep 8090 LAN-only (no port-forward);
the proxy must require HTTPS and should add its own auth layer (e.g. Authentik forward-auth) in front of the operator login.
