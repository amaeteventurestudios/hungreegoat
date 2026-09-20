# YouTube account connection (OAuth)

This is a self-hosted, optional feature. Skip this whole document if you're happy with
**Stream-Key-Only mode** — the default, no Google account or setup required. Read on if you
want HUNGREE Goat to *verify* YouTube-side state instead of only inferring it.

## Two modes

| | Stream-Key-Only (default) | Connected Account (this doc) |
|---|---|---|
| Setup required | None — works out of the box | A Google Cloud project + OAuth client (below) |
| Local encoder health | Full (always) | Full (always, unaffected by the other column) |
| "Sending to YouTube" | Confirmed (local encoder state) | Confirmed (same, unchanged) |
| "YouTube Receiving" | Always shown as **Unverified** | Real ingest status from the YouTube Data API (`active`/`ready`/`inactive`/`error`) |
| "YouTube Live" | Always shown as **Unverified** | Real broadcast lifecycle status (`created`/`ready`/`testing`/`live`/`complete`) |
| Go Live / End Broadcast buttons | Not available | Available, gated behind a confirmation click |
| What breaks if this feature is misconfigured, disconnected, or the token expires | Nothing — this column doesn't exist for you | Nothing either. The dashboard falls back to exactly the Stream-Key-Only behavior in the row above. FFmpeg and Liquidsoap are never touched by anything in this document. |

The two modes are **strictly additive**: connecting an account never changes how your stream
key or RTMPS output works, and disconnecting (or never connecting) never removes anything you
already had. This is enforced in the code, not just documented — the OAuth integration
(`apps/control/hgc/youtube_oauth.py`) never calls anything in the streaming/audio pipeline
(`streamer.py`/`liq.py`/`services.py`); it only ever reads YouTube's own API and, when you
explicitly ask, transitions a broadcast.

## 1. Google Cloud setup

You only need to do this once per YouTube channel/Google account.

1. **Create a project.** Go to [console.cloud.google.com](https://console.cloud.google.com/),
   create a new project (or reuse one you already have).
2. **Enable the YouTube Data API v3.** In the project, go to *APIs & Services → Library*,
   search "YouTube Data API v3", and enable it. (This same API covers the Live Streaming
   resources this feature uses — `liveBroadcasts`, `liveStreams`, `channels` — there's no
   separate "Live Streaming API" to enable.)
3. **Configure the OAuth consent screen** (*APIs & Services → Google Auth Platform* /
   *OAuth consent screen*, naming varies by Cloud Console version):
   - **User type / Audience: External.**
   - **Publishing status: Testing** is fine — you don't need to submit for Google
     verification just to authorize your own channel.
   - **Test users:** add the Google account email that owns the YouTube channel you're
     streaming to.
   - **Scope:** add `https://www.googleapis.com/auth/youtube`.
4. **Create an OAuth client:**
   - *APIs & Services → Credentials → Create Credentials → OAuth client ID*.
   - Application type: **Web application**.
   - **Authorized redirect URI:** `https://YOUR-CONTROL-DOMAIN/api/youtube/oauth/callback`
     — replace `YOUR-CONTROL-DOMAIN` with whatever domain your Control dashboard is actually
     reachable at (e.g. `control.hungreegoat.com`). This must match **exactly**, including
     `https://` and no trailing slash — see
     [Troubleshooting](#troubleshooting) if you get `redirect_uri_mismatch`.
5. **Download the client JSON** (the "Download JSON" button after creating the client). This
   file contains your `client_id` and `client_secret` — treat it exactly like a password.

## 2. Server setup

On the machine running `hungree-goat-control` (referred to below as `$HOME` — your own user's
home directory on that machine, e.g. `/home/youruser`):

```bash
mkdir -p ~/.config/hungree-goat
mv ~/Downloads/client_secret_*.json ~/.config/hungree-goat/youtube-oauth-client.json
chmod 600 ~/.config/hungree-goat/youtube-oauth-client.json
```

The control container mounts **only this one file**, read-only, at a container-internal path
(`/run/secrets/hungree-goat/youtube-oauth-client.json`) — not your whole `~/.config`
directory, and not a path that assumes any particular host username, so the same image works
for any self-hoster. This is already wired up in `infra/beelink/hgc-control-run.sh` (or your
platform's equivalent run script) — if the file doesn't exist, the mount is skipped entirely
and the app runs exactly as it does today, with the feature simply showing "not set up on
this server."

Once the client JSON is in place:

```bash
# Only needed the first time you enable this feature, or after pulling an update that
# changes docker/requirements.txt — installs google-api-python-client/google-auth(-oauthlib).
docker build -f docker/Dockerfile.hgc -t hungree-goat/hgc:latest docker/

systemctl --user restart hungree-goat-control   # picks up the new image + the new mount
```

Restarting `hungree-goat-control` **never** restarts Liquidsoap or the video/FFmpeg stream —
those are separate `systemd --user` units. Your broadcast keeps running through this restart.

The refresh token, once you connect, is written to
`~/hungree-goat/secrets/youtube-oauth-token.json` (mode 600) — the same directory every other
HUNGREE Goat secret already lives in, already mounted read-write, already outside Git. No
additional mount is needed for it.

## 3. Connecting

1. Open the Control dashboard → **YouTube Setup**.
2. In the **YouTube Account Integration** card, click **Connect YouTube Account**. This is a
   real browser navigation to Google's consent screen — sign in with the Google account you
   added as a test user above, and approve access.
3. Google redirects you back to the YouTube Setup page. The card now shows your channel name
   and "Connected."
4. Each station needs to be **bound** to a specific YouTube stream/broadcast before its
   pipeline health shows real (not unverified) data. If a stream key is already saved for
   that station, a **Broadcast Lifecycle** card appears with a **Bind station to YouTube
   stream** button — click it once. This is the only time the app reads your stream key's
   actual value; from then on it only uses the non-secret YouTube stream/broadcast IDs it
   discovered.

You won't be asked to re-approve on every reconnect — HUNGREE Goat requests offline access up
front and reuses the refresh token it's given. You'll only see Google's consent screen again
if you explicitly click **Reconnect** (used to recover a broken connection) or **Disconnect**
and then connect again.

## 4. Operating it

- **Refresh** (on the Account Integration card): forces an immediate re-check instead of
  waiting for the normal ~60-second cache window.
- **Disconnect**: removes the stored token only. It does **not** forget which YouTube
  stream/broadcast each station was bound to — those are non-secret resource IDs, not
  credentials, and survive a disconnect so you don't have to re-bind after a routine
  reconnect. Local streaming is completely unaffected either way.
- **Reconnect** (shown when the connection is degraded — e.g. a revoked/expired refresh
  token): re-runs the Google consent flow to get a fresh refresh token.
- **Re-bind**: re-runs the one-time stream-key lookup and updates which YouTube
  stream/broadcast a station points at. Use this if you rotate a station's stream key, or if
  the dashboard tells you the binding is "stale" (this happens automatically, and only, when
  you reconnect under a *different* YouTube channel than the one a station was bound under —
  the old binding is kept but flagged, never silently treated as still valid).
- **Go Live / Start Testing / End Broadcast**: calls the real YouTube Live Streaming API
  transition for the bound broadcast. Every one of these requires an explicit confirmation
  click in the dialog that appears — there is no automatic or scheduled transition anywhere
  in this feature.

## Troubleshooting

**`redirect_uri_mismatch`** — the most common setup error. The URI Google rejects is shown in
the error page it returns; compare it character-for-character against what you registered in
Cloud Console. Common causes: `http://` vs `https://`, a trailing slash, or `www.` vs no
`www.`. It must equal exactly
`https://YOUR-CONTROL-DOMAIN/api/youtube/oauth/callback`.

**"YouTube OAuth client JSON not found on the server"** — the file isn't at
`~/.config/hungree-goat/youtube-oauth-client.json` on the host, or `hungree-goat-control`
hasn't been restarted since you added it (the mount is applied at container start).

**Connected, but the pipeline still shows "Unverified"** — the station hasn't been bound yet
(see step 4 above), or no stream key is saved for that station (Stream URLs & Key panel).

**"No YouTube live stream found ... matching this station's stream key"** (shown when you
click Bind/Re-bind) — YouTube Studio needs an actual live stream resource created and bound
to that same stream key; a stream key alone with nothing set up in YouTube Studio yet won't
show up in discovery.

**Connection shows "degraded"** — the stored refresh token stopped working (commonly: it was
revoked from your Google Account's [third-party access
page](https://myaccount.google.com/permissions), or your OAuth consent screen is still in
Testing mode and Google expired an old grant). Click **Reconnect**.

## Never commit

- `~/.config/hungree-goat/youtube-oauth-client.json` (your OAuth client ID + secret)
- `~/hungree-goat/secrets/youtube-oauth-token.json` (your refresh token — note this file also
  embeds the client ID + secret, since the Google client library needs them to self-refresh;
  treat it with the same care as the file above)
- `~/hungree-goat/secrets/youtube-<station>.env` (your RTMPS stream keys — unrelated to OAuth,
  but the same rule applies)

None of the above are ever returned by any API response, logged, written to an event, or
included in the Logs export/diagnostics bundle feature. `.gitignore` also blocks all of them
as a second layer, but the real guarantee is architectural: they only ever live on the
server's filesystem, outside this repository's directory tree entirely.
