# Beelink / Docker deployment (current production)

This is how HUNGREE Goat actually runs today (migrated from the Raspberry Pi bare-metal
setup under `infra/pi/` — that path is kept for historical reference and as a documented
rollback target, but is no longer the primary deployment).

Target: any x86_64 Linux machine with Docker and (ideally) VAAPI hardware video
acceleration — the reference host is a Beelink SER mini-PC (AMD Ryzen, integrated GPU),
but nothing here is Beelink-specific beyond that hardware assumption. On a machine
without VAAPI, set `HGC_HW_BACKEND=software` (see `apps/control/hgc/config.py`) — slower,
but works.

## What's here

- `Dockerfile` — one image (`hungree-goat/hgc:latest`) shared by both the control app and
  the video stream process; only the runtime command differs. Bind-mounts the app code,
  media, and secrets from the host at the **same paths the code already expects** — no
  container-specific path overrides needed. Built with `docker build -f infra/beelink/Dockerfile -t hungree-goat/hgc:latest .` from the repo root (or copy it next to `apps/control` on the host and build from there, matching the deployed layout).
- `requirements.txt` — Python dependencies installed into the image's venv.
- `bin/hgc-control-run.sh`, `bin/hgc-stream-run.sh` — the actual `docker run` invocations
  (memory limits, `--device /dev/dri/renderD128` for hardware encode, host networking so
  the app can reach Liquidsoap's loopback harbors). These are what the systemd units below
  execute; read them before changing resource limits.
- `bin/hgc-monitor.sh` — endurance/health monitor variant for this hardware (reads CPU/GPU
  temperature from `k10temp`/`amdgpu` hwmon, since there's no `vcgencmd` here).
- `bin/hgc-netprobe.sh` + `systemd/hungree-goat-netprobe.service` — 30 s network-correlation
  probe (gateway, DNS, YouTube RTMPS TCP, Internet, FFmpeg output Send-Q) to
  `~/hungree-goat/logs/netprobe.log`; see `docs/streaming/RUNBOOK.md`. Deploy with
  `cp bin/hgc-netprobe.sh ~/hungree-goat/bin/`.
- `systemd/*.service` — the real, currently-running systemd **user** units (`systemctl
  --user`), portable via `%h` (systemd's home-directory specifier) — no hardcoded paths or
  usernames. Install with `cp infra/beelink/systemd/*.service ~/.config/systemd/user/ && systemctl --user daemon-reload`.

## What's NOT here (on purpose)

Secrets, the media library, the SQLite database, logs, and the reverse-tunnel SSH key
(`~/.ssh/hg-tunnel`) are never part of this repo — see `apps/control/secrets.example.md`
and `docs/RECOVERY.md`. The `bin/hgc-liquidsoap.sh`, `hgc-usb-repair.sh`, and the
`hgc-wait-*.sh` prestart scripts are shared with the Pi path and live under `infra/pi/bin/`
(byte-identical on both hosts as of this writing — not duplicated here).

## Known gap

There is not yet a single scripted `./install.sh` that takes a bare Ubuntu/Debian box all
the way to a running station — see the "Installing on a New Computer" section of the root
`README.md` for the real, current manual steps and exactly where the gap is.
