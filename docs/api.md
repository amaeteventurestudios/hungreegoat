# Public read-only API (`api.hungreegoat.com`)
All routes are GET, unauthenticated, CORS `*`, cached 2–15 s. They expose listener-safe data only.

| Route | Returns |
|---|---|
| `/v1/stations` | `{stations:[{id, name, short, genre, tags, status: live|coming_soon|offline, live, youtube_live, stream_url, youtube_url, description}]}` |
| `/v1/now-playing?station=lofi` | `{station, station_id, live, youtube_live, title, artist, album, tags, artwork, duration, elapsed, started_at, youtube_url, stream_url, server_time}` |
| `/v1/up-next?station=lofi` | `{station_id, items:[{title, artist, duration, artwork, source: engine|request}]}` |
| `/v1/schedule?station=lofi` | `{station_id, timezone, now, next_switch, today:[{name, description, start, end, on_now, next, days}]}` |
| `/v1/live` | `{stations:{lofi:{live, youtube_live, status}, …}, server_time}` |
| `/v1/artwork/{id}.jpg` · `/v1/artwork/default.jpg` | cover image (800 px JPEG) |
| `/v1/listen/{station}.mp3` | live MP3 128 kbps audio stream |
| `/v1/health/broadcast?station=lofi` | semantic broadcast health for external monitoring — see below |

Example:
```json
{"station":"Lo-Fi Afrobeats","station_id":"lofi","live":true,"youtube_live":false,"title":"Tumi","artist":"HUNGREE Goat",
 "album":"The golden touch of rhythm","tags":["Lo-Fi","Afrobeats","Chill","Instrumental"],"artwork":"/v1/artwork/123.jpg",
 "duration":171.3,"elapsed":122.0,"started_at":"2026-09-14T21:14:18+00:00","youtube_url":null,"stream_url":"/v1/listen/lofi.mp3"}
```
Never returned: stream keys, secrets, file paths, hostnames/IPs, USB/system metrics, operator data, control endpoints.
The gateway forwards **only** `/v1/*` to `api.`; `/v1/*` is blocked on `dashboard.` and `/api/*` is never exposed on `api.`.

## `/v1/health/broadcast` (semantic monitoring health)

The one deliberate exception to "no metrics" above — see `docs/monitoring-alerts.md` for why.
Always returns HTTP 200; alert on the `status` field, not transport status (the same pattern
an Uptime Kuma JSON/keyword check expects).

```json
{"status":"healthy","station":"lofi","liquidsoap":"running","ffmpeg":"running","fps":30.0,
 "speed":1.0,"bitrate_kbps":3212.4,"drop_frames":0,"background_visuals":"ok",
 "youtube_ingest":"ok","youtube_broadcast":"ok","detail":"Verified Live — YouTube Live",
 "server_time":"2026-09-21T03:08:32+00:00"}
```

`status` is one of `healthy|degraded|critical|offline|unverified` — reused directly from the
same computation the Control dashboard's top status card renders from, so this can never
disagree with what an operator sees in Control.

## Control API (private, `control.hungreegoat.com`, requires login)

Everything under `/api/*` requires the operator session cookie. Monitoring-relevant routes
added alongside the Monitoring & Alerts UI (see `docs/monitoring-alerts.md`):

| Route | Method | Returns / does |
|---|---|---|
| `/api/monitoring/overview?station=lofi` | GET | Top-level monitoring state: broadcast health, YouTube state, encoder metrics, open incident count |
| `/api/monitoring/telemetry?station=lofi&range=1h` | GET | Server-side telemetry series (`30m\|1h\|6h\|24h\|7d`) with freshness (`live\|stale\|no_data`), sample count, last-sample age, and current/min/avg/max for fps/speed/bitrate |
| `/api/monitoring/rules` | GET | The fixed alert-rule defaults currently evaluated by the watchdog |
| `/api/monitoring/test` | POST | `{"kind": "push"\|"simulate_down"\|"simulate_warning"\|"simulate_recovery"}` — safe test/simulation actions, all clearly `[TEST]`-labeled, never touch Liquidsoap/FFmpeg/the real YouTube broadcast |
| `/api/stations/{sid}/youtube/broadcast` | GET | Real YouTube state for this station's binding: `lifecycle_status`, `stream_status`, `title`, `privacy_status`, `actual_start_time`, `monitor_stream_enabled`, `enable_auto_start`, `enable_auto_stop`, `legal_transitions` (backend-authoritative — see `docs/youtube-oauth.md`) |
| `/api/stations/{sid}/youtube/broadcast/{broadcast_id}/transition` | POST | `{"status": "testing"\|"live"\|"complete"}` — rejected with 409 if not in that station's current `legal_transitions` |
| `/api/alerts` | GET | Existing incident/alert history (events/alerts tables) — Incident History in Monitoring & Alerts reads the same endpoint, filtered to broadcast-relevant categories |
