# HUNGREE Goat

HUNGREE Goat is a self-hosted 24/7 internet radio and music streaming platform.

It was originally built for Lo-Fi Afrobeats and includes a public music player, a
browser-based operator control panel, YouTube livestream broadcasting, playlists, a music
library manager, looping/animated broadcast visuals, automatic health monitoring and
recovery, and a browser-based DJ/mixing studio.

You can run HUNGREE Goat on your own Linux computer or home server.

HUNGREE Goat is created and maintained by **HUNGREE Goat Media**.

---

## What does it do?

At its core, HUNGREE Goat plays your own music library on a loop, 24/7, and can
simultaneously:

- Serve that audio to a public website player, so anyone can listen live in a browser.
- Combine it with looping background visuals and a "Now Playing" overlay into a video
  feed, and broadcast that live to YouTube.
- Give you (the operator) a private dashboard to manage all of it — upload and organize
  music, build playlists, schedule what plays when, watch the stream's health, and step in
  when something needs fixing.

It's built to run unattended: if the audio engine or the video stream crashes, it restarts
itself automatically (see [How it works](#how-hungree-goat-works)).

## Features

- 24/7 automated music playback (scheduled playlists, fallback/backup sources, silence
  detection)
- Public web player (`apps/player`) — a standalone site anyone can listen to
- Browser-based Control dashboard (`apps/control`) — the operator's private cockpit
- YouTube Live broadcasting, with an honest health dashboard that separates "is my local
  encoder working" from "is YouTube actually receiving it" (see below — there's no
  YouTube API integration yet, so the second half is always shown as unverified rather
  than guessed)
- Playlists and music library management (upload, tag, organize, schedule)
- Looping/animated "broadcast visuals" behind the YouTube video feed
- Automatic monitoring and recovery for the audio and video processes
- Multiple independent stations from one install (ships configured for two: Lo-Fi and
  Afrobeats)
- A public, read-only API (`/v1/*`) for the website/player to use
- A browser-based DJ/mixing studio (`apps/dj-studio`) for live or recorded mixes

Not yet built: authoritative YouTube-side verification (no YouTube Data API/OAuth
integration exists today), and a single scripted installer (see
[Quick start](#quick-start) below for exactly what that means in practice).

## Screenshots

### Control Dashboard

![HUNGREE Goat Control Dashboard](docs/images/control-dashboard.webp)

Manage playback, schedules, playlists, music sources, broadcast outputs, metadata, health,
alerts, and station controls from one browser-based dashboard.

### YouTube Streaming & Health

![HUNGREE Goat YouTube Streaming and Health Dashboard](docs/images/youtube-dashboard.webp)

Monitor the local streaming pipeline, stream quality, YouTube output, bitrate, realtime
performance, recovery status, warnings, and recent incidents. Note the honest "Local Output
Active — YouTube Not Confirmed" status in the screenshot above: this app can see and control
its own local encoder, but has no YouTube API connection yet to confirm YouTube itself is
receiving the stream or airing it live — see [YouTube streaming](#youtube-streaming) below.

_Still needed: the public player, Broadcast Visuals, and Workout DJ. Add them here the same
way — real screenshots, checked for anything account-specific before committing._

## Requirements

**Minimum**
- A Linux computer or server (this has only ever been run on Linux)
- [Docker](https://docs.docker.com/engine/install/)
- Git
- Your own music library (any of: mp3, m4a, aac, wav, flac, ogg, opus)
- Internet access (for YouTube broadcasting and the public player/API)

**Recommended**
- Ubuntu or Debian
- 8 GB+ RAM (the control, audio, and video processes reserve roughly 2 GB combined at
  their memory ceilings; more headroom matters if you also run other workloads on the box)
- A GPU with hardware video encoding (VAAPI on Intel/AMD, or `v4l2m2m` on a Raspberry Pi)
  — continuous 24/7 software encoding will otherwise keep a CPU core busy indefinitely
- A dedicated, always-on machine (a mini-PC, NUC, or similar) rather than a laptop that
  sleeps

**Optional**
- A domain name + reverse proxy/TLS, if you want the Control dashboard or public API
  reachable from outside your home network (see `infra/gateway/`)
- A YouTube channel with live streaming enabled and a stream key, if you want YouTube
  broadcasting
- Hardware acceleration (see above) — HUNGREE Goat also works with `HGC_HW_BACKEND=software`

## Quick start

**There is not currently a single scripted installer** (no working `./install.sh`) — saying
otherwise would be documenting something that doesn't exist. What exists today is the exact
manual path below, built from the real Docker image, run scripts, and systemd units in
`infra/beelink/` (the current production deployment method). It's accurate, but it is
several manual steps, not one command. See [Installing HUNGREE Goat on a New
Computer](#installing-hungree-goat-on-a-new-computer) for the full walkthrough; this is the
short version:

```bash
git clone git@github.com:amaeteventurestudios/hungreegoat.git
cd hungreegoat
docker build -f infra/beelink/Dockerfile -t hungree-goat/hgc:latest .
```

Then follow the full installation section below — you still need to lay out `~/hungree-goat/`
on the host (app code + a `secrets/` directory you create yourself + your music), point a
media mount at `/media/hungree-goat`, and install the systemd units before anything actually
runs.

## Installing HUNGREE Goat on a New Computer

This assumes a fresh Ubuntu/Debian Linux machine and walks through what it would actually
take to rebuild HUNGREE Goat from GitHub plus a private backup of your own data (see
[Backups](#backups)).

1. **Install prerequisites**: Docker, Git, and — if you want hardware video encoding —
   your GPU's VAAPI drivers (e.g. `mesa-va-drivers` on Ubuntu for Intel/AMD).
2. **Clone this repository**:
   ```bash
   git clone git@github.com:amaeteventurestudios/hungreegoat.git ~/hungree-goat-src
   ```
3. **Build the image**:
   ```bash
   cd ~/hungree-goat-src
   docker build -f infra/beelink/Dockerfile -t hungree-goat/hgc:latest .
   ```
4. **Lay out the runtime directory** the app expects at `~/hungree-goat/`:
   ```bash
   mkdir -p ~/hungree-goat/app ~/hungree-goat/secrets ~/hungree-goat/run ~/hungree-goat/logs ~/hungree-goat/data ~/hungree-goat/bin
   cp -r apps/control/hgc apps/control/static ~/hungree-goat/app/
   cp infra/beelink/bin/*.sh infra/pi/bin/*.sh ~/hungree-goat/bin/ && chmod +x ~/hungree-goat/bin/*.sh
   chmod 700 ~/hungree-goat/secrets
   ```
5. **Attach or copy your music library** to `/media/hungree-goat/` (see [Music
   library](#music-library) below for the expected layout) — from a backup, an external
   drive, or by copying files in directly.
6. **Add your private secrets locally** — never from this repo. See
   [Secrets and security](#secrets-and-security).
7. **Initialize the database**: the app creates its SQLite database and operator account
   automatically on first start (see `apps/control/hgc/db.py`, `auth.py`) — there is no
   separate manual migration step today.
8. **Install and start services**:
   ```bash
   cp infra/beelink/systemd/*.service ~/.config/systemd/user/
   systemctl --user daemon-reload
   systemctl --user enable --now hungree-goat-control hungree-goat-liquidsoap@lofi hungree-goat-stream@lofi
   loginctl enable-linger "$USER"   # so these keep running after you log out
   ```
9. **Open Control**: `http://<this-machine>:8090` (or your reverse-proxied domain, see
   `infra/gateway/`). Sign in with the operator account the app created on first start (see
   `apps/control/hgc/auth.py` for exactly where that initial credential is written).
10. **Configure your station** — upload music, build playlists, set a schedule — from the
    Control dashboard.
11. **Configure YouTube** — see [YouTube streaming](#youtube-streaming) below.
12. **Verify stream health** — the YouTube Setup page's Pipeline Health and status banner
    should read "Healthy" (local, everything off) or "Unverified" (actively sending — this
    app can't confirm YouTube's side yet), never a false green "connected".

**The honest test for this section**: if the current machine disappeared tomorrow, could you
buy another Linux box, follow the steps above, restore your private files and music from a
backup, and get HUNGREE Goat running again? Today, yes — but only by following these manual
steps carefully; there's no single button for it yet. See `docs/RECOVERY.md` for the
disaster-recovery-focused version of this same checklist.

## Music library

Music lives **outside Git**, under a media mount at `/media/hungree-goat/` (configurable via
the `HGC_MEDIA` environment variable — see `apps/control/hgc/config.py`):

```
/media/hungree-goat/
├── music/          per-station subfolders; this is what the library scanner walks
├── artwork/        cover art
├── animation/      looping background-visual source clips
├── fallback/       the emergency/silence-failover loop
├── jingles/
├── station-ids/
└── playlists/
```

Supported audio formats: `mp3`, `m4a`, `aac`, `wav`, `flac`, `ogg`, `opus`.

The library is discovered by scanning `music/` — there's no separate "import" step; add
files to the right folder (or upload them through the Control dashboard's Library page) and
the scanner picks them up. Playlists are created and edited from the Control dashboard, not
by hand-editing files.

Music should **not** be committed to this repository — it's real audio content, not source
code, and doesn't belong in Git history.

## YouTube streaming

A YouTube **stream key** is a secret string YouTube Studio gives you (Go Live → Stream
settings) that authorizes whatever you send to that URL to appear as your channel's live
broadcast. Treat it like a password.

HUNGREE Goat stores it in `~/hungree-goat/secrets/youtube-<station>.env` (mode 600, on the
server only) — set it from the Control dashboard's YouTube Setup → Stream URLs & Key panel,
never by hand-editing a file with a real key in it. **Real stream keys must never be
committed to this repository** (see `infra/pi/youtube.env.example` for what the file
actually looks like, with a placeholder).

**Important distinction, honestly stated**: HUNGREE Goat has no YouTube Data API/OAuth
integration yet. It can tell you, with certainty, whether its own local encoder is running
and actively *sending* data toward YouTube's server. It cannot currently confirm that
YouTube is *receiving* that data, or that your broadcast is actually *live* to viewers —
those are only knowable from YouTube Studio itself today. The YouTube Setup dashboard is
built to say so plainly ("Unverified") rather than assume sending implies success.

To reconnect a stream that's stopped sending, use the "Reconnect to YouTube" action on that
page — it restarts the video/YouTube streaming process only (your music keeps playing; the
audio engine is a separate process and isn't touched).

## Start / stop / restart

HUNGREE Goat is four independent `systemd --user` units — restarting one never touches the
others:

```bash
systemctl --user restart hungree-goat-control          # dashboard + API
systemctl --user restart hungree-goat-liquidsoap@lofi  # this station's music engine
systemctl --user restart hungree-goat-stream@lofi      # this station's video/YouTube output
systemctl --user restart hungree-goat-tunnel           # reverse tunnel, only if you're using the gateway setup
```

(Replace `lofi` with your station id — this repo ships two, `lofi` and `afrobeats`.) You
can also start/stop/restart the video stream from the Control dashboard's Danger Zone,
without touching a terminal.

Deeper systemd/Docker details (resource limits, what each unit actually runs) live in
`infra/beelink/README.md`.

## Updating

1. `git pull` the latest code into your clone of this repository.
2. Rebuild the image if `infra/beelink/Dockerfile` or `requirements.txt` changed:
   `docker build -f infra/beelink/Dockerfile -t hungree-goat/hgc:latest .`
3. Copy the updated `apps/control/hgc` and `apps/control/static` into `~/hungree-goat/app/`
   (see `infra/pi/deploy.sh` for the exact rsync pattern this is based on — a Beelink-side
   equivalent script doesn't exist yet; this is currently a manual copy).
4. **Never overwrite**: anything under `~/hungree-goat/secrets/`, `run/`, `logs/`, `data/`
   (your database), or the media mount — none of that comes from Git.
5. Restart `hungree-goat-control` to pick up backend (Python) changes — static
   JS/CSS/HTML go live immediately since they're read from disk on each request; only
   Python needs a restart.
6. Only restart `hungree-goat-liquidsoap@<station>` or `hungree-goat-stream@<station>` if
   you changed something in that specific process's own code (`station.liq`,
   `streamer.py`) — both interrupt the live broadcast briefly, so don't restart them for an
   unrelated change.

Back up your database and secrets before any update you're unsure about (see below).

## Backups

**GitHub backs up the source code. It does not back up your private, running station.**
Before you'd ever need it, back these up separately and privately:

| What | Where it lives | Notes |
|---|---|---|
| Database | `~/hungree-goat/data/hungree-goat.sqlite3*` | tracks, play history, settings, schedules |
| Secrets | `~/hungree-goat/secrets/` | stream keys, operator credentials, session key — **never in Git** |
| Music library | `/media/hungree-goat/music/` | your actual audio files |
| Artwork | `/media/hungree-goat/artwork/` | |
| Broadcast visuals | `/media/hungree-goat/animation/` | |
| Playlists/metadata | `/media/hungree-goat/playlists/` and the database above | |
| Logs | `~/hungree-goat/logs/` | optional — useful for troubleshooting, not required for recovery |

See `docs/RECOVERY.md` for the full disaster-recovery checklist built around exactly this
list.

## Secrets and security

**Real secrets must never be committed to this repository.** Full stop.

What's local-only (already in `.gitignore`, verified — see the secret audit note in
`docs/RECOVERY.md`): `secrets/`, any `*.env` file, `operator.json`/`operator-password.txt`,
`*.key`/`*.pem`/`*.crt`/`*.token`, `run/`, `logs/`, `data/`, `*.sqlite3*`.

What's safe and tracked: example/template files with placeholder values only —
`apps/control/secrets.example.md` (documents what each secret file is, with no real values),
`apps/player/.env.example`, `infra/pi/youtube.env.example`. Copy these and fill in your own
values locally; never fill them in and commit the result.

See `docs/security.md` for more.

## How HUNGREE Goat works

In plain English, before the technical diagram:

**Music Player (Liquidsoap)**
Keeps the station's music playing continuously — picks the next track, applies fades and
volume normalization, and falls back to a backup source or emergency loop if something's
wrong with the primary playlist.

**Video Streamer (FFmpeg)**
Combines the music and the background visuals — plus a "Now Playing" overlay — into the
outgoing video stream, encoded (in hardware, where available) and sent out over RTMPS.

**Background Visuals**
Supplies the looping/rotating visual content shown behind the video stream, switching once
per song.

**Control**
The browser dashboard (this repo's `apps/control`) used to manage the station — library,
playlists, schedule, YouTube setup, and live health monitoring.

**Player**
The public, listener-facing music player website (`apps/player`).

**YouTube Output**
Sends the finished video stream to YouTube over RTMPS. See [YouTube
streaming](#youtube-streaming) above for what this can and can't confirm today.

Now the technical picture — component detail lives in `docs/architecture.md`:

```
hungreegoat.com ──┬── Listen Live ──▶ api.hungreegoat.com/v1/listen/lofi.mp3 ─┐
                  └── Watch YouTube ──▶ YouTube                               │
player.hungreegoat.com ── /v1/now-playing · up-next · schedule · stations ───┤   (public, read-only)
                                                                             ▼
                                              gateway (nginx, TLS) ── SSH reverse tunnel ── broadcast host
control.hungreegoat.com ── LOGIN ── same gateway ── /api/* (private) ──────────────────────┤ ├─ HUNGREE Goat Control (FastAPI :8090)
                                                                                             ├─ Liquidsoap 2.4.5 (Docker) ── AAC/MP3 mounts
                                                                                             └─ FFmpeg (hardware video) ── RTMPS ── YouTube
```

## Repository layout

| Path | What it is |
|---|---|
| `apps/website` | The public HUNGREE Goat homepage (static, framework-free) |
| `apps/player` | The public music player (AGPL-3.0 — see `apps/player/NOTICE.md`) |
| `apps/control` | The operator dashboard and backend (FastAPI + a plain-JS SPA) — the bulk of the engineering lives here |
| `apps/dj-studio` | Browser-based DJ/mixing studio (built on the MIT-licensed Aurdour project — see `apps/dj-studio/NOTICE.md`) |
| `infra/beelink` | Current production deployment: Docker image, run scripts, systemd units |
| `infra/pi` | The original Raspberry Pi bare-metal deployment — legacy, kept as a working rollback target |
| `infra/gateway` | Public-facing nginx + SSH reverse-tunnel setup, so the private broadcast host is never directly exposed |
| `packages/brand` | Shared brand assets — colors, fonts, logos |
| `packages/ui` | Shared public-facing UI primitives (CSS) |
| `packages/shared` | The public API client (`hg-api.js`) and the static-site build script |
| `docs/` | Architecture, deployment, development, DNS, security, and API reference docs |

## Troubleshooting

- **Music isn't playing** — check `systemctl --user status hungree-goat-liquidsoap@<station>`,
  then the Control dashboard's Pipeline Health (Music Player stage) and Logs page.
- **Control page won't open** — check `systemctl --user status hungree-goat-control`; if it's
  not running, `journalctl --user -u hungree-goat-control` for why.
- **YouTube isn't receiving the stream** — first check the YouTube Setup page's Pipeline
  Health: is "Sending to YouTube" actually green? If yes, this app genuinely can't tell you
  more without YouTube Studio itself (see [YouTube streaming](#youtube-streaming)) — check
  there directly. If "Sending to YouTube" is red, use Reconnect to YouTube.
- **Background visuals are unavailable** — check the Diagnostics section (Advanced Settings)
  for the background helper's PID and restart count; `0`/unavailable usually means the
  looping clip failed to decode (unsupported format/codec) and it's fallen back to the
  default loop.
- **Stream is running too slowly** (Streaming Speed reads "Too Slow"/below realtime) —
  usually CPU/GPU contention on the host, or software encoding without hardware
  acceleration available; check Advanced Settings → Diagnostics for the actual encoder
  in use.
- **Where are the logs** — `~/hungree-goat/logs/` on the host, or the Control dashboard's
  Logs page (Events / Audio engine / Video / Stream service / Control / Kernel).
- **How to restart only the right thing** — see [Start / stop / restart](#start--stop--restart)
  above; restarting Control never interrupts the live broadcast, restarting the stream or
  audio engine briefly does.

## Development

See `docs/development.md` for the full developer setup. In short:
- `apps/website`, `apps/player`: `npm run dev` in that directory (see each `package.json`).
- `apps/control`: Python (FastAPI) backend under `apps/control/hgc`, plain-JS SPA under
  `apps/control/static` (no build step — edit and reload). `apps/control/requirements.txt`
  for backend dependencies; `apps/control/tests` for its test suite.
- `apps/dj-studio`: static, no-build ES modules — see its own `package.json`/`NOTICE.md`.

## Contributing

1. Fork this repository.
2. Create a branch for your change.
3. Make your change and test it locally (see [Development](#development)).
4. Open a pull request describing what changed and why.

This project doesn't yet have a formal contribution guide beyond that — if you're planning
something larger than a small fix, opening an issue first to discuss it is a good idea.

## Community Edition

HUNGREE Goat Community Edition is free and open source under the **GNU Affero General
Public License v3.0 (AGPL-3.0)** — see the root [`LICENSE`](LICENSE) file for the full text.

You can use, study, modify, and self-host the Community Edition under the terms of the
AGPL-3.0. If you modify the AGPL-covered software and make that modified version available
to users over a network, the AGPL's network-use clause (section 13) requires you to also make
your modified source available to those users — this applies to the original HUNGREE Goat
code covered by the root `LICENSE`; components under their own licenses (see [License](#license)
below) follow their own terms instead.

This is a plain-English summary, not a substitute for reading the license itself or getting
your own legal advice.

## Commercial Licensing

Need to use HUNGREE Goat in a proprietary product, a white-label deployment, a closed-source
integration, or another commercial arrangement that doesn't fit the Community Edition's
AGPL-3.0 terms?

Commercial licensing is available from HUNGREE Goat Media for the original HUNGREE Goat code,
where HUNGREE Goat Media holds the right to offer alternative terms. This does **not** relicense
or change the terms of any third-party component bundled in this repository — `apps/player`,
`apps/dj-studio`, the bundled fonts, and everything else listed in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) remain governed by their own licenses
regardless of any commercial license for HUNGREE Goat's original code.

Contact [info@hungreegoat.com](mailto:info@hungreegoat.com?subject=HUNGREE%20Goat%20Commercial%20Licensing)
to discuss commercial licensing. See the [For Business](https://hungreegoat.com/business) page
for the managed-hosting option as well.

## License

HUNGREE Goat Community Edition — the original HUNGREE Goat code and documentation in this
repository (`apps/website`, `apps/control`, `packages/brand` excluding fonts, `packages/ui`,
`packages/shared`, `infra/`, and `docs/`) — is **Copyright © 2023–2026 HUNGREE Goat Media**
and licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)** — see the root
[`LICENSE`](LICENSE) file for the full text. Need different terms? See
[Commercial Licensing](#commercial-licensing) above.

Several components are separately licensed and are **not** covered by the root `LICENSE` —
see `THIRD_PARTY_NOTICES.md` for the full breakdown:

- **`apps/player`** is distributed under **AGPL-3.0** in its own right (it's a derivative of a
  third-party AGPL-3.0 project, copyright Gilles Momeni) — see `apps/player/LICENSE` and
  `apps/player/NOTICE.md` for exactly what that requires (including that this repository's
  player source stay published).
- **`apps/dj-studio`**'s DJ engine is built on **Aurdour** (MIT) and its mastering DSP on
  **noisyloop/mastering** (ISC) — see `apps/dj-studio/NOTICE.md` for the full, file-by-file
  provenance breakdown, and `THIRD_PARTY_NOTICES.md` for the copyright holders.
- Third-party runtime components keep their own licenses regardless of the above:
  Liquidsoap (GPL-2.0), FFmpeg (LGPL/GPL depending on build), fonts (SIL OFL 1.1).

The root `LICENSE`'s AGPL-3.0 grant applies only to the code and documentation original to
this repository — it does not and cannot override the separate licenses above.

If you're evaluating this repository for a public/open-source release, read `docs/RECOVERY.md`'s
open-source-readiness notes first — the root `LICENSE` and the AGPL-3.0 `apps/player`
subtree currently make different promises, which needs a deliberate decision, not an
assumption, before going public.
