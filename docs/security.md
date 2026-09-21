# Security boundaries
- **Public** (`hungreegoat.com`, `player.`, `api.`): may read `/v1/*` and play `/v1/listen/*`. No auth, no writes.
- **Private** (`dashboard.`): operator login (PBKDF2 hash on disk, signed HttpOnly cookie, `Secure` behind HTTPS, login
  rate-limited at the gateway); everything under `/api/*`. Optional Authentik forward-auth snippet is prepared in the vhost.
- **Pi**: port 8090 is LAN-only; the gateway reaches it through an outbound SSH reverse tunnel (`infra/gateway`), user
  `hgtunnel` with `restrict,permitlisten=127.0.0.1:18090,ForceCommand /bin/false`. No inbound router ports.
- **Liquidsoap control socket**: unix socket, only the control backend. Harbor ports bind to loopback.
- **Secrets**: `~/hungree-goat/secrets/` (0700/0600) on the Pi — operator hash, session key, internal token, DJ password,
  `youtube-<station>.env` (stream key; masked in UI, never logged, never returned). `.gitignore` blocks all of them.
- **YouTube OAuth** (optional — see `docs/youtube-oauth.md`): the client JSON lives outside
  the repo/secrets dir entirely, at `~/.config/hungree-goat/` on the host, mounted **read-only**
  into the control container at a single container-native path (never the whole host
  directory, never a path assuming a particular username). The refresh token it produces is
  written to `secrets/youtube-oauth-token.json` (0600, same directory as everything else
  above). Neither file, nor any stream key, is ever returned by an API response, logged, or
  included in the Logs export/diagnostics feature. A lost/expired/revoked token degrades this
  feature only — it never stops or restarts Liquidsoap/FFmpeg.
- **Media** never enters Git (`*.wav`, `music/`, `media/`).
- **Monitoring** (see `docs/monitoring-alerts.md`): the ntfy.sh push topic
  (`~/hungree-goat/secrets/ntfy-topic.txt` on the Beelink; `~/.hgc-ntfy-topic` on the two
  monitoring hosts, all 0600) is low-sensitivity but not public — anyone who learns it can post
  to and read that notification channel, though it grants no control over the broadcast itself.
  The external monitor cron job runs as the pre-existing restricted `hermes-ro` account on the
  shared Hetzner gateway (no sudo beyond `docker ps`/`docker compose ls`) and only ever makes
  outbound HTTPS requests — it was not granted any new permission to add this.
