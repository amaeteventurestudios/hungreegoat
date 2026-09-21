# Monitoring & Alerts

Built in response to a 2026-09-20/21 incident: the YouTube broadcast silently stalled (FFmpeg
kept emitting a live progress heartbeat while its actual frame/out_time output froze — see the
`StallDetector` docstring in `apps/control/hgc/streamer.py` and its regression tests in
`apps/control/tests/test_streamer_stall.py`) and the operator nearly missed it because nothing
paged a phone. See the git log around this file's introduction for the full incident/recovery
narrative — this doc covers the resulting monitoring architecture, not the incident itself.

## Architecture

Three independent layers, on purpose — monitoring must never become a dependency the
broadcast itself relies on:

1. **Semantic broadcast health** (`GET /v1/health/broadcast?station=lofi`, `apps/control/hgc/public_api.py`) —
   the single source of truth every monitor below reads from. Reuses the exact same
   `_youtube_health()` the Control dashboard renders from, so "healthy" can never mean two
   different things in two different places. Fields: `status` (`healthy|degraded|critical|offline|unverified`),
   `liquidsoap`, `ffmpeg`, `fps`, `speed`, `bitrate_kbps`, `drop_frames`, `background_visuals`,
   `youtube_ingest`, `youtube_broadcast`, `detail`. No secrets, paths, PIDs or hostnames.
   Publicly reachable at `https://api.hungreegoat.com/v1/health/broadcast` — always returns
   HTTP 200 with the real status in the body (a monitor should alert on body content, not
   transport status, same as an Uptime Kuma keyword/JSON check).

2. **Primary external monitor** — `infra/monitoring/hgc-monitor-external.sh`, runs via cron on
   the Hetzner gateway (`hetzner-usg`, 2.29.28.125) as the existing restricted `hermes-ro`
   account. Needs no elevated permissions — it only makes outbound HTTPS requests. Checks the
   semantic health endpoint plus `control.`/`player.`/`hungreegoat.com`. Because it's outside
   the house, it's the only thing that can still alert if Beelink, the router, or the home ISP
   goes down entirely.

3. **Secondary local monitor** — `infra/monitoring/hgc-monitor-local.sh`, runs via cron on
   `pi-node-01` as its own user. Checks Beelink directly over the LAN
   (`http://192.168.6.233:8090/v1/health/broadcast`), bypassing the public gateway/tunnel
   entirely. Does not touch the Pi's existing Uptime Kuma instance (separate script, separate
   state file, no shared credentials) — that instance already monitors unrelated personal
   services (FreshRSS, Linkding, n8n, Syncthing, ChangeDetection) and integrating with it would
   require its admin login, which isn't available to this automation.

### Automated cross-perspective correlation

The Pi has its own internet connection, independent of Beelink's LAN — so `hgc-monitor-local.sh`
checks BOTH perspectives in the same run (LAN-direct to Beelink, and the same public health
endpoint the external monitor checks) and classifies them together, rather than requiring a
human to compare two separate alerts:

| LAN → Beelink | Public endpoint | Local monitor's classification |
|---|---|---|
| healthy | healthy | no alert |
| healthy | fails | **"Public/external connectivity degraded"** — tunnel, gateway, DNS, or ISP egress; Beelink itself is fine |
| fails | fails | **"HUNGREE Goat broadcast host unreachable"** — evidence points at Beelink/LAN/router/power, not claimed with certainty |
| fails | healthy | **"Local network anomaly"** — unusual; may be the Pi's own network interface rather than Beelink |

The external (Hetzner) monitor still can't see the Pi's perspective — it only ever reports what
it itself observed (public reachability). Reading its alerts alongside the local monitor's
already-correlated classification above still helps: if Hetzner reports an outage AND the
local monitor's classification is "broadcast host unreachable," that's two independent
vantage points agreeing, not a coincidence. This is evidence for a human to weigh, not an
automated root-cause claim — see `docs/RECOVERY.md`'s Confirmed/Likely/Hypothesis framework,
which this follows.

## Alerting: ntfy.sh (push)

Both monitors post to the same private ntfy.sh topic (free, no account, no signup — a
sufficiently random topic name is the only access control). The topic is stored at
`~/.hgc-ntfy-topic` on each monitoring host (mode 600) and `~/hungree-goat/secrets/ntfy-topic.txt`
on the Beelink (mode 600) — treat it like a low-sensitivity credential (see `docs/security.md`):
anyone who learns it can post to (and read) the same channel, though they can't affect the
broadcast itself.

**To receive alerts (iPhone/Android)**:
1. Install the free **ntfy** app.
2. Tap **+**.
3. Tap **Add Subscription**.
4. Enter the topic name from `~/hungree-goat/secrets/ntfy-topic.txt` (not printed in this doc
   or the UI — treat it like a low-sensitivity credential, see `docs/security.md`).
5. Leave **"Use another server"** off — the default `https://ntfy.sh` is exactly right, no
   custom server needed.
6. Tap **Subscribe**.
7. Allow notification permission when prompted.

The Monitoring & Alerts → Notifications tab in Control has a **Send Test Push** button to
verify the whole chain end-to-end.

Each monitor tracks its own state (`~/.hgc-monitor-state-external` / `~/.hgc-monitor-state-local`)
to:
- send one **OUTAGE** push the moment a check transitions healthy → unhealthy (priority: urgent)
- send a **STILL DOWN** reminder at most once per 15 minutes while it stays unhealthy (no alert storm)
- always send a **RECOVERED** push with the outage duration when it transitions back — a
  monitor that only ever says something is wrong and never confirms it's fixed is incomplete.

Cron: both run every 2 minutes (`*/2 * * * *`), installed via `crontab -l | ... | crontab -`
so nothing pre-existing on either host was overwritten.

## Server-side telemetry (`telemetry` table, `apps/control/hgc/db.py`)

The same 15s watchdog tick that raises/resolves the alerts above also writes one row per
station to a `telemetry` table: `fps`, `speed`, `bitrate_kbps`, `drop_frames`, `encoder_state`,
`liquidsoap_alive`, `bg_ok`, `overall_level`. Pruned to 7 days on an hourly timer from the same
loop — no separate cron, no separate service. `GET /api/monitoring/telemetry?station=lofi&range=1h`
(ranges: `30m|1h|6h|24h|7d`) returns the series downsampled to ~360 points for the longer
ranges, plus `freshness` (`live` if the last sample is <45s old, else `stale`, or `no_data`),
`sample_count`, `last_sample_age_sec`, and current/min/avg/max per metric — this is what
Monitoring & Alerts → Overview renders (see the README's Monitoring & Alerts section for the
LIVE/STALE/NO-DATA display rules). Monitoring failing here can't affect the broadcast: it's a
try/except'd step inside the existing watchdog loop, same as everything else in it.

## Monitoring & Alerts UI (Control)

A real section in Control (`apps/control/static/pages.js`, `pages.monitoring`) — Overview,
Monitors, Notifications, Alert Rules, Incident History, Settings — backed entirely by the
APIs above and the existing `/api/alerts`. Incident History and the Alerts tab intentionally
reuse the existing events/alerts system rather than a second, parallel incident tracker (see
"Alerting: HGC's own internal push" above). Test/simulation controls (`/api/monitoring/test`)
never touch Liquidsoap, FFmpeg, or the real YouTube broadcast — simulations write a clearly
`[TEST]`-labeled event and, for down/recovery, a labeled test push.

## Email — Resend (`email_send()`, `apps/control/hgc/main.py`)

Preferred provider per the operator's existing account. Reads the API key from
`~/hungree-goat/secrets/resend-api-key.txt` (0600, never logged, never returned by any API
response) — activates automatically the moment that file exists, with **no other
configuration needed**. Sender `alerts@hungreegoat.com`, destination `info@hungreegoat.com`.
Wired into the escalation ladder: the watchdog's `_notify_hgc_alert_state()` sends one email
per incident once it's been unresolved for 5 minutes (`EMAIL_ESCALATION_SEC`), and only marks
it sent if the Resend call actually succeeded — a missing/invalid key retries next tick rather
than silently giving up. `GET /api/monitoring/overview` reports `email.configured` honestly;
until a key exists this shows **"Resend API key required"**, never a fabricated success.
If `hungreegoat.com` isn't yet verified as a sending domain in Resend, a test send reports
that precisely (Resend's own rejection reason, via `POST /api/monitoring/test {"kind":"email"}`).

## SMS (optional, not a blocker)

Destination is known (`+1 840-999-2755`) — the missing piece is a provider (Twilio, Telnyx, or
similar). Shown honestly in Notifications as **"Provider required"**, never as a missing
destination. Does not block push or email; the escalation ladder's 10-minute tier already has
the right shape (`_notify_hgc_alert_state()` would gain a third branch calling a
`notify_sms()` the same way `email_send()` is called today) once a provider exists.

## Pi / Uptime Kuma — what's actually needed

Inspected without touching anything (no password reset, no database write, no monitor
changes):

```text
Existing Uptime Kuma:
Host: pi-node-01, docker compose service in ~/services/pi-stack/compose.yaml
Image: louislam/uptime-kuma:1 (v1.23.17)
URL: http://192.168.6.235:3001 (LAN-only)
Data: ~/services/pi-stack/data/uptime-kuma/kuma.db (sqlite, 13MB), healthy, up since 2026-09-18
Existing monitors (5): ChangeDetection.io, FreshRSS, Linkding, n8n, Syncthing GUI — all
  unrelated personal services, nothing HUNGREE-Goat-related yet.
Need: the admin username/password for this instance's web UI.
Reason: Kuma v1.x has no REST API — adding a monitor requires either an authenticated
  Socket.IO session (needs the real login) or direct sqlite writes to kuma.db while the
  service is live (not attempted — real risk of corrupting a running app's own state; not
  worth it for an optional integration when the login is the actual ask).
```

Until that login is provided, add these 4 checks manually via the Kuma web UI (a few minutes,
does not disturb the 5 existing monitors) — HTTP(s) monitor type, expected status 200:
`https://api.hungreegoat.com/v1/health/broadcast`, `https://control.hungreegoat.com/`,
`https://player.hungreegoat.com/`, `https://hungreegoat.com/`.

## External monitoring — infrastructure decision (closed)

No new paid infrastructure. The existing `hermes-ro` cron job on the shared Hetzner gateway
(`hetzner-usg`) is the permanent external monitor — it costs nothing extra, needs no elevated
permissions (outbound HTTPS only), and does not touch the shared box's other tenants. A
dedicated monitoring VPS was considered and explicitly ruled out as unnecessary; not tracked
as a gap.

## Known gaps (deliberately not built yet)

- **SMS escalation**: see above — optional, provider required, architecture ready.
- **Operator-editable alert-rule thresholds**: the Alert Rules tab is currently read-only —
  thresholds live in code next to the checks they describe (`streamer.py`'s `StallDetector`,
  `main.py`'s watchdog) specifically so they can't drift out of sync with what's actually
  evaluated. Making them editable would need those checks to read from `db.get_setting()`
  instead of a constant — a reasonable follow-up, not done here. A full Create/Edit Rule
  wizard UI (multi-step form, custom conditions) was deliberately not built for the same
  reason: it would be UI with no real backend behind it, which is worse than not having it.
- **Uptime Kuma integration on the Pi**: pending the admin login above — see that section for
  the exact ask; the current Pi cron monitor (`hgc-monitor-local.sh`) is fully independent of
  Kuma and keeps working regardless.
