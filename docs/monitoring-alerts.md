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
`~/.hgc-ntfy-topic` on each monitoring host (mode 600) and `/home/aumanah/.config/hungree-goat/ntfy-topic.txt`
on the Beelink (mode 600) — treat it like a low-sensitivity credential (see `docs/security.md`):
anyone who learns it can post to (and read) the same channel, though they can't affect the
broadcast itself.

**To receive alerts**: install the free ntfy app (iOS/Android) or use ntfy.sh's web push, and
subscribe to the topic in `/home/aumanah/.config/hungree-goat/ntfy-topic.txt`.

Each monitor tracks its own state (`~/.hgc-monitor-state-external` / `~/.hgc-monitor-state-local`)
to:
- send one **OUTAGE** push the moment a check transitions healthy → unhealthy (priority: urgent)
- send a **STILL DOWN** reminder at most once per 15 minutes while it stays unhealthy (no alert storm)
- always send a **RECOVERED** push with the outage duration when it transitions back — a
  monitor that only ever says something is wrong and never confirms it's fixed is incomplete.

Cron: both run every 2 minutes (`*/2 * * * *`), installed via `crontab -l | ... | crontab -`
so nothing pre-existing on either host was overwritten.

## Known gaps (deliberately not built yet)

- **Email escalation (5 min unresolved)** and **SMS escalation (10 min unresolved)**: no SMTP
  or SMS provider credentials exist anywhere accessible. Per the "do not fabricate credentials"
  rule, these are not implemented — only push (ntfy) exists today. Providing SMTP credentials
  (host/user/pass or an API key for a provider like Postmark/SendGrid) and an SMS provider
  (e.g. Twilio) would let this be added without changing the architecture — the state-file/
  cooldown logic above already has the right shape for that ladder, it's just missing a second
  and third `notify_email()`/`notify_sms()` call gated on `now - first_bad_at` thresholds.
- **Server-side telemetry persistence** (fps/bitrate/speed/ingest/lifecycle history over
  30m/1h/6h/24h/7d) and the corresponding LIVE/STALE/NO-DATA telemetry UI: not yet built. The
  current dashboard graphs remain browser-tab-only. This is the next planned phase.
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
- **Monitoring & Alerts UI** (Overview/Monitors/Notifications/Alerts/Alert Rules/Incident
  History/Settings inside Control): not started — the above is ops-side infrastructure only.
