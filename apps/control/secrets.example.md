# Secrets layout (never committed) — `~/hungree-goat/secrets/` on the Pi, mode 0700
| file | created by | purpose |
|---|---|---|
| `operator.json` | backend on first start | operator username + PBKDF2 hash |
| `operator-password.txt` | backend on first start (deleted after first password change) | initial password |
| `session.key` | backend | signs session cookies |
| `internal.token` | backend | Liquidsoap → backend callbacks |
| `live-<station>.password` | `hgc-liquidsoap.sh` | DJ harbor password |
| `youtube-<station>.env` | YouTube Setup page | `YOUTUBE_RTMPS_URL=…` / `YOUTUBE_STREAM_KEY=…` (0600) |
