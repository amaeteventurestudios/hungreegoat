# YouTube OAuth Integration — Handoff (2026-09-20)

> **Historical record (added 2026-09-27).** The "Missing code verifier" failure described
> below was fixed afterwards: `apps/control/hgc/youtube_oauth.py` now carries the PKCE
> `code_verifier` inside the signed `state` token (`make_state`). The integration is live and
> verified (see the README). Kept for the history of the investigation.

Status: **implemented, deployed to production (`ai-node-01`), OAuth callback currently fails.**
Canonical repo has all changes staged in the working tree but **NOT committed or pushed**.

## TL;DR for whoever picks this up

Everything is built and live except the final token exchange step. Google's consent screen
works, the redirect back to `hungree-goat-control` works, but the callback then fails
exchanging the code for tokens with:

```json
{"detail":"Could not complete the YouTube connection"}
```

The real exception, pulled from the server's own event log (`db.log_event`, safe — no
secrets in it), is:

```
YouTube OAuth callback failed: (invalid_grant) Missing code verifier.
```

**Root cause, diagnosed but not yet fixed**: this is a PKCE error. `google_auth_oauthlib`'s
`Flow` object auto-generates a `code_verifier` when `authorization_url()` is called, and that
same verifier must be presented again when `fetch_token()` is called for the code exchange.
`hgc/youtube_oauth.py`'s `authorization_url()` and `exchange_code()` each call the module-level
`_build_flow()` and get a **fresh `Flow` instance** — since `/api/youtube/oauth/connect` and
`/api/youtube/oauth/callback` are two separate HTTP requests (and, in production, possibly
handled by different worker threads/processes), the `code_verifier` generated during the first
call is never available to the second call's new `Flow` instance. That's why Google's token
endpoint returns `invalid_grant: Missing code verifier`.

**Next task**: persist the `code_verifier` across the connect→callback request boundary the
same way `state` already is (see `make_state()`/`check_state()` in `hgc/youtube_oauth.py`,
and `OAUTH_STATE_COOKIE` in `hgc/main.py`) — e.g. bundle it into the same signed cookie payload
alongside `state`, or a short-lived server-side cache keyed by `state`. Then reconstruct the
`Flow` for `exchange_code()` with that same `code_verifier` before calling `fetch_token()`.
`Flow.from_client_secrets_file(...)` accepts `code_verifier=` as of recent
`google-auth-oauthlib` versions — confirm the installed version (`2026-09-20` build has
`google-auth-oauthlib 1.4.1`, see below) supports it, or generate/store the verifier manually
with `google_auth_oauthlib.flow.Flow`'s underlying `requests_oauthlib` PKCE helper if not.

## What's confirmed working (the callback *was* reached)

- The "Connect YouTube Account" real-navigation link works.
- Google's consent screen loads and accepts the test-user login.
- The redirect back to `https://control.hungreegoat.com/api/youtube/oauth/callback?code=...&state=...`
  is reached — confirmed by the fact that the failure is inside the `try/except` around
  `youtube_oauth.exchange_code(code)` in `youtube_oauth_callback()` (`hgc/main.py`), which only
  executes after the CSRF `state` cookie check already passed.
- So: OAuth client setup (Google Cloud project, consent screen, redirect URI registration),
  the connect redirect, the state/CSRF cookie round-trip, and the callback route itself are all
  confirmed correct. Only the code→token exchange step is broken.

## What's implemented

Full YouTube OAuth account connection + real YouTube Data/Live Streaming API integration for
the Control dashboard's YouTube Setup page, per the approved plan (station-to-YouTube binding
by non-secret resource IDs, not the stream key; gated Go Live; Stream-Key-Only mode unaffected;
minimal-footprint single-file read-only mount for the client JSON).

### Files changed/added (identical in both `ai-node-01` runtime and this canonical repo)
| Runtime path (`~/hungree-goat/`) | Canonical path | What |
|---|---|---|
| `app/hgc/config.py` | `apps/control/hgc/config.py` | `YOUTUBE_CLIENT_JSON`, `YOUTUBE_TOKEN_PATH` constants |
| `app/hgc/youtube_oauth.py` (new) | `apps/control/hgc/youtube_oauth.py` (new) | All OAuth/API logic — flow, token save/load/refresh, identity, discovery-by-key, binding, transition |
| `app/hgc/main.py` | `apps/control/hgc/main.py` | New `/api/youtube/oauth/*` and `/api/stations/{sid}/youtube/broadcast*` routes; `_youtube_health()` now maps real YouTube state into the existing `ok|warn|err|off|unverified` pipeline vocabulary |
| `app/static/pages.js` | `apps/control/static/pages.js` | YouTube Setup page: real Connect/Connected/Degraded UI, Broadcast Lifecycle card, gated Go Live buttons |
| `bin/hgc-control-run.sh` | `infra/beelink/bin/hgc-control-run.sh` | New read-only single-file mount for the client JSON (conditional on the file existing) |
| `docker/requirements.txt` | `apps/control/requirements.txt` **and** `infra/beelink/requirements.txt` (canonical has two copies of this file, kept in sync) | Added `google-api-python-client`, `google-auth-oauthlib`, `google-auth` |

### Docs added/updated (canonical only — no runtime docs/ tree)
- `docs/youtube-oauth.md` (new) — full self-hoster setup guide: Google Cloud walkthrough,
  server setup, operating instructions, troubleshooting (including `redirect_uri_mismatch`),
  never-commit list.
- `README.md` — Features/Not-yet-built/screenshot caption updated to reflect OAuth is now
  optional-but-available; "YouTube streaming" section rewritten with the two-mode explanation.
- `docs/security.md` — new bullet for the OAuth client JSON + token file handling.
- `docs/deployment.md` — new note that a `requirements.txt` change (this feature) requires an
  image rebuild before a `hungree-goat-control` restart, unlike every other change so far.
- `apps/control/secrets.example.md` — added `youtube-oauth-token.json` to the secrets table.
- Runtime `~/hungree-goat/README.md` (the ops quick-reference on `ai-node-01` itself, **not**
  part of this repo) also got a short pointer section — already deployed, nothing to port.

### Design points worth knowing (see the full plan history / commit message when this lands)
- **Binding, not the stream key, is the persisted identity.** The stream key is read once, in
  memory, in `discover_and_bind()`, purely to find the matching `liveStream` by
  `cdn.ingestionInfo.streamName`. From then on, `db.get_setting(sid, "youtube_binding")` stores
  only `{stream_id, broadcast_id, channel_id, bound_at, stale}` — never the key.
- **Disconnect never clears bindings** — they're non-secret resource IDs, not credentials, and
  survive a reconnect. A binding is only ever marked `stale: true` (never deleted) when a
  reconnect resolves to a *different* `channel_id` than it was bound under
  (`reconcile_bindings_on_connect()`), and a stale binding is never treated as verified.
- **No forced `prompt=consent`** on routine connects — only on an explicit `?reauthorize=1`
  (shown as "Reconnect" when the connection is degraded).
- **Quota safety**: `get_identity()`/`get_youtube_state()` cache for 60s each (module-level
  dicts in `youtube_oauth.py`) — the dashboard's 5s poll never hits the YouTube API directly.
- **Go Live is fully wired but gated**: every transition (`testing`/`live`/`complete`) requires
  `confirmDlg()` on the frontend before the API call fires. **Not invoked during this task at
  all** — see Security constraints below.

## Runtime changes already deployed on `ai-node-01`

1. **Docker image rebuilt**: `hungree-goat/hgc:latest` rebuilt from
   `docker/Dockerfile.hgc` + updated `docker/requirements.txt`. Confirmed via
   `pip list` inside the new image: `google-api-python-client 2.200.0`,
   `google-auth 2.58.0`, `google-auth-oauthlib 1.4.1`, `google-auth-httplib2 0.4.2`. Build-only
   — confirmed it did **not** affect the already-running `hgc-stream-lofi` container (it kept
   running on the pre-rebuild image throughout).
2. **`bin/hgc-control-run.sh` updated and live**: new mount
   `-v /home/aumanah/.config/hungree-goat/youtube-oauth-client.json:/run/secrets/hungree-goat/youtube-oauth-client.json:ro`,
   applied only if the host file exists. Confirmed present in the actual running `docker run`
   command (`systemctl --user status hungree-goat-control`) after restart.
3. **`hungree-goat-control` restarted** at `2026-09-20 15:03:52 PDT` — clean startup, no
   crash-loop, no import errors ("Application startup complete" in the journal).
4. **Client JSON confirmed reachable inside the container** at
   `/run/secrets/hungree-goat/youtube-oauth-client.json`, mode `600` (contents never read by
   me at any point).

## Exact verification results (all passed before the OAuth attempt)

1. ✅ `hungree-goat-control` healthy post-restart — clean journal, Uvicorn serving.
2. ✅ Liquidsoap `Active since`: unchanged, `Fri 2026-09-18 17:19:06 PDT` (pre- and
   post-restart identical).
3. ✅ Stream `Active since`: unchanged, `Sun 2026-09-20 10:42:56 PDT` (pre- and post-restart
   identical).
4. ✅ `on_air: True`.
5. ✅ fps `30.01`, speed `1x` (real-time).
6. ✅ Client JSON visible inside the running container at the new mount path.
7. ✅ `/api/youtube/oauth/status` returns `401` unauthenticated (correct — same auth guard as
   every other route); in-process, `client_configured: True, connected: False` — the expected
   clean disconnected state.
8. ✅ Login page (`/`) returns `200`; `pages.js` served fresh from the restarted container is
   byte-identical to disk and contains the new OAuth/Go-Live UI markup.
9. ✅ No transition/Go-Live endpoint was ever called.

**Current stream health (most recent check, 2026-09-20 ~15:09 PDT):**
- `on_air: true`
- fps ≈ 30 (30.01)
- speed ≈ 1.0x
- Liquidsoap `Active since`: unchanged from before this entire task began
- Video/FFmpeg stream `Active since`: unchanged since the operator-triggered restart earlier
  in this session (not caused by this task — see prior session notes)

## Current failure

```
POST/GET flow: Connect → Google consent (succeeds) → redirect to
/api/youtube/oauth/callback?code=...&state=... (reached) → exchange_code(code) call →

{"detail":"Could not complete the YouTube connection"}
```
Real exception (from the server's own event log, safe to share — no secrets):
```
YouTube OAuth callback failed: (invalid_grant) Missing code verifier.
```
See **Root cause** above. The one-line summary: PKCE `code_verifier` isn't being carried from
the `/connect` request's `Flow` instance to the `/callback` request's separate `Flow` instance.

## Next task

Fix the OAuth exchange/callback root cause in `hgc/youtube_oauth.py` /
`hgc/main.py`'s `youtube_oauth_connect`/`youtube_oauth_callback`: persist the PKCE
`code_verifier` the same way `state` is already persisted (signed cookie or short-lived
server-side cache keyed by `state`), and pass it back into the `Flow` used for
`exchange_code()`. Then re-run the full connect flow for real, and continue the remaining
verification below.

## Remaining verification (not yet done — blocked on the fix above)

- Token file written at `~/hungree-goat/secrets/youtube-oauth-token.json`, mode `600`.
- `channels.list` returns the real connected channel identity.
- Per-station binding discovery (`discover_and_bind`) correctly matches by stream key once,
  in memory, then persists only non-secret IDs.
- `hungree-goat-control` restart **survives** the OAuth connection (status stays `connected`
  without re-authorizing).
- Forced access-token refresh succeeds using the stored refresh token.
- YouTube Setup page shows real (not `unverified`) pipeline stage data.
- Final `Active since` re-check for Liquidsoap/stream (must still be unchanged).

## Security constraints (apply to all future work on this task)

- **Never** expose, log, print, or return via any API response: `client_secret`, the OAuth
  authorization `code`, the access token, the refresh token, or any station's YouTube stream
  key. This includes error messages/tracebacks surfaced to the frontend — keep those generic
  (as the current `HTTPException(500, "Could not complete the YouTube connection")` already
  does) and put detail only in the server-side event log via `db.log_event`, which itself must
  never be handed the raw secret values either.
- **Do not touch Liquidsoap or FFmpeg** while fixing this — this bug is entirely inside the
  OAuth code path, which has no call into `services.py`/`streamer.py`/`liq.py` at all.
- **Do not invoke Go Live** (the broadcast transition endpoint) during this fix or its
  verification — that remains gated for the operator to trigger themselves, watching their own
  channel, exactly as originally scoped.

## Paths reference

- OAuth client JSON, host: `/home/aumanah/.config/hungree-goat/youtube-oauth-client.json`
  (mode `600`, never committed, never read into chat/logs by any assistant session).
- Container mount (read-only): `/run/secrets/hungree-goat/youtube-oauth-client.json`.
- Token file (once working): `~/hungree-goat/secrets/youtube-oauth-token.json` (mode `600`).

## Canonical repo status

**Not committed, not pushed.** All files above are already copied byte-identical from the
verified runtime versions into this working tree (confirmed via `diff` before copying — zero
drift beyond the intended changes). `git status --short` right now:
```
 M README.md
 M apps/control/hgc/config.py
 M apps/control/hgc/main.py
 M apps/control/requirements.txt
 M apps/control/secrets.example.md
 M apps/control/static/pages.js
 M docs/deployment.md
 M docs/security.md
 M infra/beelink/bin/hgc-control-run.sh
 M infra/beelink/requirements.txt
?? apps/control/hgc/youtube_oauth.py
?? docs/youtube-oauth.md
```
(`apps/control/hgc/dj_orchestrator.py` and the three `docs/images/*` untracked files are the
user's own pre-existing, unrelated changes — not part of this task, do not stage or commit
them.)

**Do not commit or push until the OAuth exchange bug above is fixed and the "Remaining
verification" checklist is complete.**
