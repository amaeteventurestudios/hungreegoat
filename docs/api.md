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

Example:
```json
{"station":"Lo-Fi Afrobeats","station_id":"lofi","live":true,"youtube_live":false,"title":"Tumi","artist":"HUNGREE Goat",
 "album":"The golden touch of rhythm","tags":["Lo-Fi","Afrobeats","Chill","Instrumental"],"artwork":"/v1/artwork/123.jpg",
 "duration":171.3,"elapsed":122.0,"started_at":"2026-09-14T21:14:18+00:00","youtube_url":null,"stream_url":"/v1/listen/lofi.mp3"}
```
Never returned: stream keys, secrets, file paths, hostnames/IPs, USB/system metrics, operator data, control endpoints.
The gateway forwards **only** `/v1/*` to `api.`; `/v1/*` is blocked on `dashboard.` and `/api/*` is never exposed on `api.`.
