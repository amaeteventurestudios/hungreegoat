# Secrets layout (never committed) — `~/hungree-goat/secrets/` on the Pi, mode 0700
| file | created by | purpose |
|---|---|---|
| `operator.json` | backend on first start | operator username + PBKDF2 hash |
| `operator-password.txt` | backend on first start (deleted after first password change) | initial password |
| `session.key` | backend | signs session cookies |
| `internal.token` | backend | Liquidsoap → backend callbacks |
| `live-<station>.password` | `hgc-liquidsoap.sh` | DJ harbor password |
| `youtube-<station>.env` | YouTube Setup page | `YOUTUBE_RTMPS_URL=…` / `YOUTUBE_STREAM_KEY=…` (0600) |
| `youtube-oauth-token.json` | backend, after connecting a YouTube account (optional feature — see `docs/youtube-oauth.md`) | Google OAuth refresh token; also embeds the OAuth client id/secret since the client library needs them to self-refresh (0600) |

The YouTube OAuth *client* JSON itself (`youtube-oauth-client.json`) lives outside this
directory entirely, at `~/.config/hungree-goat/` on the host, mounted read-only into the
container at a container-native path (`/run/secrets/hungree-goat/...`) — see
`docs/youtube-oauth.md`.
