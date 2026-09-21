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

### Reading the two monitors together (incident correlation)

Neither monitor "decides" a root cause by itself — each only ever reports what it actually
observed. A human reading both alert labels can correlate:

| External (Hetzner) | Local (Pi→Beelink LAN) | Likely area |
|---|---|---|
| OUTAGE | healthy | Gateway / tunnel / ISP egress — Beelink itself is fine |
| OUTAGE | also OUTAGE | Beelink / LAN / home power |
| healthy | OUTAGE | Local network issue that hasn't reached the public path yet — investigate before it does |

This is evidence for a human to correlate, not an automated root-cause claim — see
`docs/RECOVERY.md`'s Confirmed/Likely/Hypothesis framework, which this follows.

## Alerting: ntfy.sh (push)

Both monitors post to the same private ntfy.sh topic (free, no account, no signup — a
sufficiently random topic name is the only access control). The topic is stored at
`~/.hgc-ntfy-topic` on each monitoring host (mode 600) and `~/hungree-goat/secrets/ntfy-topic.txt`
on the Beelink (mode 600) — treat it like a low-sensitivity credential (see `docs/security.md`):
anyone who learns it can post to (and read) the same channel, though they can't affect the
broadcast itself.

**To receive alerts**: install the free ntfy app (iOS/Android) or use ntfy.sh's web push, and
subscribe to the topic in `~/hungree-goat/secrets/ntfy-topic.txt`.

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

## Known gaps (deliberately not built yet)

- **Email escalation (5 min unresolved)** and **SMS escalation (10 min unresolved)**: no SMTP
  or SMS provider credentials exist anywhere accessible. Per the "do not fabricate credentials"
  rule, these are not implemented — only push (ntfy) exists today. Providing SMTP credentials
  (host/user/pass or an API key for a provider like Postmark/SendGrid) and an SMS provider
  (e.g. Twilio) would let this be added without changing the architecture — the state-file/
  cooldown logic above already has the right shape for that ladder, it's just missing a second
  and third `notify_email()`/`notify_sms()` call gated on `now - first_bad_at` thresholds.
- **Uptime Kuma integration on the Pi**: not done. The existing instance's admin login isn't
  available to this automation, and resetting it unprompted would lock out the operator's own
  access to their existing personal dashboard. Either provide that login, or add the four
  HUNGREE Goat checks manually via its web UI (semantic health URL above, plus the three public
  domains) — takes a few minutes.
- **Dedicated monitoring compute on Hetzner** (rather than piggybacking on the shared
  `hermes-ro` cron job): the current external monitor works today and needs no new spend, but
  a small dedicated VPS (~€4-5/mo in the same Hetzner Cloud project — `hcloud` CLI is already
  configured) would be a cleaner, more capable base for future monitoring work (e.g. a real
  Uptime Kuma instance) without adding any load or risk to the shared multi-tenant gateway that
  hosts unrelated Umanah Systems Group client services (EspoCRM, Documenso, client data rooms).
  This is a real recurring-cost decision, not made unilaterally — flagged for the operator.
- **Operator-editable alert-rule thresholds**: the Alert Rules tab is currently read-only —
  thresholds live in code next to the checks they describe (`streamer.py`'s `StallDetector`,
  `main.py`'s watchdog) specifically so they can't drift out of sync with what's actually
  evaluated. Making them editable would need those checks to read from `db.get_setting()`
  instead of a constant — a reasonable follow-up, not done here.
- **Automated cross-host incident correlation**: the external and local monitors each alert
  independently with labeled messages a human can correlate (see the table above); there's no
  shared incident record between them yet (that would need one monitor to report to the other,
  or both to report to a third point — deliberately not built to keep each monitor's failure
  domain fully independent of the others).
