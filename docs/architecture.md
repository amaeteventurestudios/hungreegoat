# Architecture

## Broadcast core
As of the 2026-09-19 migration, production runs on an x86_64 Linux host (reference:
a Beelink SER mini-PC, AMD Ryzen, VAAPI hardware video), Docker-isolated — see
`infra/beelink/`. The original Raspberry Pi 4B deployment (`infra/pi/`) is kept intact as
a documented rollback target, not actively serving traffic. Both share the same
`apps/control` source; only the container/host layer differs.
- **Liquidsoap 2.4.5** (Docker `savonet/liquidsoap`, host network, uid 1000) — one process per station. The control backend
  chooses every track (`request.dynamic` → `GET /api/internal/next`), applies fades, ReplayGain, silence guard and the
  fallback chain (live › remote › scheduled › backup › emergency › silence). Outputs on the loopback harbor: `/lofi.wav`
  (endless 44.1 kHz s16 stereo PCM, for FFmpeg — replaced ADTS AAC, whose multi-RDB frames crashed FFmpeg) and
  `/lofi-listen.mp3` (128 kbps, for Listen Live / the public player).
- **FFmpeg** (`apps/control/hgc/streamer.py`) — hardware decode of the 720p loop + hardware H.264 encode (VAAPI on the
  current host; `HGC_HW_BACKEND` also supports `v4l2m2m` for the Pi and a `software` fallback), with a
  1280×300 overlay band (artwork, title, artist, branding) piped in at 30 fps; audio read from the WAV mount with
  `-ignore_length 1` (the WAV header's fixed size would otherwise cut audio off after 22,826 s and live-lock the
  encode — see `docs/streaming/FFMPEG_STALL_INVESTIGATION.md`) and encoded to AAC 192 kbps / 48 kHz; RTMPS to
  YouTube. A background-visuals helper process (BgFeeder) feeds the looping video behind that overlay through a
  FIFO. A supervisor watchdog (`StallDetector`) restarts FFmpeg if `frame`/`out_time` stop advancing for 30 s.
  Operations: `docs/streaming/RUNBOOK.md`.
- **HUNGREE Goat Control** (FastAPI, port 8090, LAN-only) — catalog (SQLite), scheduler, queue, alerts, uploads,
  YouTube setup (local-encoder health always available; an optional OAuth connection — see `docs/youtube-oauth.md` —
  adds real YouTube Data/Live Streaming API verification of ingest and broadcast lifecycle, with a
  backend-authoritative legal-transition state machine; without it, YouTube-side status is honestly reported as
  unverified, never inferred), a background watchdog that persists telemetry and raises/resolves alerts on real
  encoder/YouTube state (`docs/monitoring-alerts.md`), operator SPA (`static/`), and the public read-only router
  (`/v1/*`, including the semantic `GET /v1/health/broadcast` used by external monitoring).

## Public surfaces
Static, framework-free pages built by `packages/shared/build.mjs`, which copies brand assets, injects the API base and
stamps a content hash into every asset URL (no stale bundles). They only ever call `/v1/*`.

## Data flow
```
browser ── /v1/now-playing (6 s poll, 2 s server cache) ──▶ gateway ──▶ tunnel ──▶ control ──▶ Liquidsoap state
browser ── <audio src=/v1/listen/lofi.mp3> ────────────────▶ gateway ──▶ tunnel ──▶ control ──▶ harbor MP3 mount
```
A listener's play/pause only affects their own `<audio>`; nothing public can reach the control socket or `/api/*`.
