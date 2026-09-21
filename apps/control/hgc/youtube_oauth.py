"""YouTube OAuth account connection + Data/Live Streaming API access.

Kept entirely separate from the local encoder pipeline (streamer.py/liq.py/services.py): this
module only ever *reads* YouTube-side state (ingest health, broadcast lifecycle) and, when
explicitly asked, transitions an existing broadcast. It never starts/stops/restarts Liquidsoap
or FFmpeg, and any failure in here — a bad token, an API error, a missing client JSON — can
never take the local stream down. See docs/youtube-oauth.md for full setup instructions;
Stream-Key-Only mode (no OAuth at all) keeps working with none of this module involved.

Identity model: a station's private RTMPS stream key (already stored in
secrets/youtube-<sid>.env — see main.py's _yt_read/_yt_write) is read and used ONLY ONCE, in
memory, during discover_and_bind(), to find which YouTube liveStream it corresponds to. After
that, the app persists and uses only non-secret YouTube resource IDs (stream_id/broadcast_id/
channel_id — see get_binding/set_binding). The key itself is never written into the binding,
logged, or returned by any API response.
"""
from __future__ import annotations
import json
import os
import secrets
import time
from string import ascii_letters, digits
from typing import Any

from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from itsdangerous import BadSignature, URLSafeTimedSerializer

from . import config, db
from .auth import SESSION_KEY_FILE

SCOPES = ["https://www.googleapis.com/auth/youtube"]
REDIRECT_URI = os.environ.get("HGC_YOUTUBE_REDIRECT_URI", "https://control.hungreegoat.com/api/youtube/oauth/callback")

CLIENT_JSON_PATH = config.YOUTUBE_CLIENT_JSON
TOKEN_PATH = config.YOUTUBE_TOKEN_PATH

IDENTITY_TTL = 60   # seconds — quota safety: the dashboard polls every 5s, the API doesn't.
HEALTH_TTL = 60

_identity_cache: dict[str, Any] = {"data": None, "at": 0.0}
_health_cache: dict[str, dict] = {}


def _write_secret_json(path, data: dict) -> None:
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(data, f)


def _state_serializer() -> URLSafeTimedSerializer:
    # Same signing secret as the operator session cookie (hgc/auth.py), different salt —
    # itsdangerous's intended way to derive independent tokens from one secret. No new
    # CSRF/secret-management mechanism introduced.
    return URLSafeTimedSerializer(SESSION_KEY_FILE.read_text().strip(), salt="hgc-yt-oauth-state")


def make_state(code_verifier: str) -> str:
    # Bundles the PKCE code_verifier into the same signed, short-lived token already used as
    # the CSRF state — it travels to Google and back unchanged (opaque to Google) and is also
    # mirrored into the httponly OAUTH_STATE_COOKIE, so no server-side session store is needed.
    # /connect and /callback are separate requests (and possibly separate worker threads), so
    # the verifier must ride along in this token rather than live on a module-level Flow.
    return _state_serializer().dumps({"t": time.time(), "cv": code_verifier})


def parse_state(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        return _state_serializer().loads(token, max_age=600)   # 10 min — plenty for a consent click
    except BadSignature:
        return None


def client_json_available() -> bool:
    return CLIENT_JSON_PATH.exists()


def _generate_code_verifier() -> str:
    # Same charset google_auth_oauthlib's own Flow would auto-generate (RFC 7636 unreserved
    # chars), just produced up front so it can be bundled into the state token before the Flow
    # is built — see make_state().
    chars = ascii_letters + digits + "-._~"
    return "".join(secrets.choice(chars) for _ in range(128))


def _build_flow(code_verifier: str | None = None) -> Flow:
    return Flow.from_client_secrets_file(
        str(CLIENT_JSON_PATH), scopes=SCOPES, redirect_uri=REDIRECT_URI,
        code_verifier=code_verifier, autogenerate_code_verifier=code_verifier is None,
    )


def authorization_url(reauthorize: bool = False) -> tuple[str, str]:
    """reauthorize=True adds prompt=consent — only used by an explicit Reconnect/Re-authorize
    action (recovering a broken refresh token, or an intentional re-auth). Routine connects
    don't force the consent screen: access_type=offline alone is enough for Google to issue a
    refresh token on first authorization for this client+scope."""
    code_verifier = _generate_code_verifier()
    flow = _build_flow(code_verifier=code_verifier)
    state = make_state(code_verifier)
    kwargs: dict[str, Any] = {"access_type": "offline", "include_granted_scopes": "true", "state": state}
    if reauthorize:
        kwargs["prompt"] = "consent"
    auth_url, _ = flow.authorization_url(**kwargs)
    return auth_url, state


def exchange_code(code: str, code_verifier: str) -> Credentials:
    # code_verifier comes from the validated state token (see main.py's callback) — a fresh
    # Flow instance here would otherwise have no way to know the verifier the /connect request's
    # Flow generated, which is exactly what produced the (invalid_grant) Missing code verifier
    # failure this replaces.
    flow = _build_flow(code_verifier=code_verifier)
    flow.fetch_token(code=code)
    creds = flow.credentials
    save_credentials(creds)
    return creds


def save_credentials(creds: Credentials) -> None:
    _write_secret_json(TOKEN_PATH, {"token_json": creds.to_json(), "saved_at": time.time()})


def load_credentials() -> Credentials | None:
    if not TOKEN_PATH.exists():
        return None
    try:
        raw = json.loads(TOKEN_PATH.read_text())
        creds = Credentials.from_authorized_user_info(json.loads(raw["token_json"]), SCOPES)
    except Exception:
        return None
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(GoogleRequest())
            save_credentials(creds)
        except Exception:
            return None
    return creds


def disconnect() -> None:
    """Removes the token only. Station bindings (non-secret resource IDs) are deliberately
    left in place — see reconcile_bindings_on_connect() for the only place they change."""
    try:
        TOKEN_PATH.unlink()
    except FileNotFoundError:
        pass
    _identity_cache.update(data=None, at=0.0)


def _yt_client(creds: Credentials):
    return build("youtube", "v3", credentials=creds, cache_discovery=False)


def get_identity(force: bool = False) -> dict:
    now = time.time()
    if not force and _identity_cache["data"] is not None and now - _identity_cache["at"] < IDENTITY_TTL:
        return _identity_cache["data"]
    creds = load_credentials()
    if not creds:
        result = {"connected": False}
    else:
        try:
            resp = _yt_client(creds).channels().list(part="snippet", mine=True).execute()
            items = resp.get("items") or []
            if not items:
                result = {"connected": False, "degraded": True, "error": "No channel found on this account"}
            else:
                ch = items[0]
                result = {"connected": True, "degraded": False, "channel_id": ch["id"],
                          "channel_title": ch["snippet"]["title"], "last_verified": now}
        except Exception as e:
            # Token exists but the API call failed (revoked/expired refresh, network, quota) —
            # degraded, not disconnected: local streaming is never affected by this either way.
            result = {"connected": True, "degraded": True, "error": str(e)}
    _identity_cache.update(data=result, at=now)
    return result


def get_binding(sid: str) -> dict | None:
    return db.get_setting(sid, "youtube_binding")


def set_binding(sid: str, binding: dict) -> None:
    db.set_setting(sid, "youtube_binding", binding)


def clear_binding(sid: str) -> None:
    db.set_setting(sid, "youtube_binding", None)
    invalidate_health_cache(sid)


def reconcile_bindings_on_connect(channel_id: str | None) -> None:
    """Called right after a successful connect/reconnect. A station's existing binding is
    non-secret resource IDs, not a credential, so it survives disconnect/reconnect by default.
    The only automatic change here: if the newly-connected account's channel doesn't match the
    channel the binding was made under, the binding is marked stale (never deleted) so the UI
    stops presenting it as verified and prompts Re-bind instead."""
    if not channel_id:
        return
    for sid in config.STATION_IDS:
        b = get_binding(sid)
        if not b or b.get("channel_id") == channel_id:
            continue
        b = dict(b)
        b["stale"] = True
        set_binding(sid, b)
        invalidate_health_cache(sid)


def get_bind_error(sid: str) -> dict | None:
    return db.get_setting(sid, "youtube_bind_error")


def _set_bind_error(sid: str, reason: str | None) -> None:
    db.set_setting(sid, "youtube_bind_error", {"reason": reason, "at": time.time()} if reason else None)


def clear_bind_error(sid: str) -> None:
    """Called when a station's stream key changes — an old auto-bind failure reason no longer
    applies to whatever key is saved now."""
    _set_bind_error(sid, None)


def discover_and_bind(sid: str, stream_key: str) -> dict:
    """One-time (auto, right after connect) or explicit Re-bind lookup. `stream_key` is used
    only in this function's local scope to match against YouTube's ingestionInfo.streamName —
    it is never stored, logged, or included in the returned binding.

    Any failure is classified into one of the safe, UI-facing reasons callers can show the
    operator (see _set_bind_error): no matching stream found, multiple streams found, an API
    error, or a quota issue. "No broadcast bound" is deliberately NOT an error here — a stream
    match with no liveBroadcast yet is a valid, real state (see main.py's goLiveHtml)."""
    creds = load_credentials()
    if not creds:
        raise RuntimeError("YouTube account not connected")
    yt = _yt_client(creds)
    try:
        matches = []
        page_token = None
        while True:
            resp = yt.liveStreams().list(part="id,cdn", mine=True, maxResults=50, pageToken=page_token).execute()
            matches.extend(s for s in resp.get("items", [])
                           if s.get("cdn", {}).get("ingestionInfo", {}).get("streamName") == stream_key)
            page_token = resp.get("nextPageToken")
            if not page_token:
                break
        if not matches:
            raise RuntimeError("No matching stream found: no YouTube live stream on the connected "
                                "account matches this station's stream key")
        if len(matches) > 1:
            raise RuntimeError("Multiple streams found: more than one YouTube live stream on this "
                                "account matches this station's stream key — resolve the duplicate "
                                "in YouTube Studio")
        stream_id = matches[0]["id"]

        broadcast_id = None
        page_token = None
        while True:
            resp = yt.liveBroadcasts().list(part="id,contentDetails", broadcastStatus="all", maxResults=50, pageToken=page_token).execute()
            for b in resp.get("items", []):
                if b.get("contentDetails", {}).get("boundStreamId") == stream_id:
                    broadcast_id = b["id"]
                    break
            page_token = resp.get("nextPageToken")
            if broadcast_id or not page_token:
                break
    except HttpError as e:
        status = getattr(e.resp, "status", None)
        reason = ("Quota issue: the YouTube API quota was exceeded — try again later" if status == 403 and "quota" in str(e).lower()
                  else f"API error: YouTube API returned an error (HTTP {status})")
        _set_bind_error(sid, reason)
        raise RuntimeError(reason) from e
    except RuntimeError as e:
        _set_bind_error(sid, str(e))
        raise

    identity = get_identity()
    binding = {"stream_id": stream_id, "broadcast_id": broadcast_id,
               "channel_id": identity.get("channel_id"), "bound_at": time.time(), "stale": False}
    set_binding(sid, binding)
    _set_bind_error(sid, None)
    invalidate_health_cache(sid)
    return binding


def legal_transitions(lifecycle_status: str | None, stream_status: str | None, monitor_enabled: bool) -> list[str]:
    """Backend-authoritative legal-transition set for the broadcast lifecycle buttons — the
    frontend must render buttons from exactly this list, never from a generic "disable only the
    current state" check (that's the bug that let a `complete` broadcast still show enabled
    Start Testing / Go Live buttons during the 2026-09-20/21 outage).

    This is deliberately *necessary, not sufficient*: YouTube's real API has additional,
    undocumented timing constraints beyond what's captured here (e.g. a `ready` broadcast with
    active ingest and monitorStream enabled was still rejected with `invalidTransition` shortly
    after binding during recovery from that outage) — so a button being enabled here is not a
    guarantee the API call will succeed, only that it isn't *known-illegal*. The transition
    endpoint's own error handling (see main.py's youtube_broadcast_transition) is what surfaces
    a real rejection safely; this function's job is only to stop offering transitions that are
    unconditionally wrong for the current lifecycle, like Go Live on a completed broadcast."""
    if lifecycle_status in (None, "complete", "revoked"):
        return []
    if lifecycle_status == "live":
        return ["complete"]
    if lifecycle_status == "testing":
        return ["complete"] + (["live"] if stream_status == "active" else [])
    if lifecycle_status in ("ready", "created"):
        if stream_status != "active":
            return []
        return ["testing"] if monitor_enabled else ["live"]
    return []


def get_youtube_state(sid: str, force: bool = False) -> dict:
    """Never raises — callers treat any problem here exactly like the no-OAuth case
    (fall back to 'unverified'), so a YouTube API hiccup can't make the dashboard itself look
    broken."""
    now = time.time()
    cached = _health_cache.get(sid)
    if not force and cached and now - cached["at"] < HEALTH_TTL:
        return cached["data"]
    binding = get_binding(sid)
    if not binding or binding.get("stale"):
        data = {"bound": False, "stale": bool(binding and binding.get("stale"))}
        _health_cache[sid] = {"data": data, "at": now}
        return data
    creds = load_credentials()
    if not creds:
        data = {"bound": True, "connected": False}
        _health_cache[sid] = {"data": data, "at": now}
        return data
    try:
        yt = _yt_client(creds)
        stream_resp = yt.liveStreams().list(part="status", id=binding["stream_id"]).execute()
        stream_items = stream_resp.get("items") or []
        stream_status = stream_items[0]["status"]["streamStatus"] if stream_items else None
        lifecycle_status = None
        title = privacy_status = actual_start_time = latency_preference = None
        monitor_enabled = False
        enable_auto_start = enable_auto_stop = None
        if binding.get("broadcast_id"):
            b_resp = yt.liveBroadcasts().list(part="status,snippet,contentDetails", id=binding["broadcast_id"]).execute()
            b_items = b_resp.get("items") or []
            if b_items:
                b = b_items[0]
                lifecycle_status = b["status"]["lifeCycleStatus"]
                privacy_status = b["status"].get("privacyStatus")
                snip = b.get("snippet", {})
                title = snip.get("title")
                actual_start_time = snip.get("actualStartTime")   # only set once really live; see main.py's duration calc
                cd = b.get("contentDetails", {})
                monitor_enabled = bool(cd.get("monitorStream", {}).get("enableMonitorStream"))
                latency_preference = cd.get("latencyPreference")
                enable_auto_start = cd.get("enableAutoStart")
                enable_auto_stop = cd.get("enableAutoStop")
        data = {"bound": True, "connected": True, "stream_status": stream_status,
                "lifecycle_status": lifecycle_status, "broadcast_id": binding.get("broadcast_id"),
                "stream_id": binding.get("stream_id"), "last_verified": now,
                "title": title, "privacy_status": privacy_status, "actual_start_time": actual_start_time,
                "latency_preference": latency_preference, "monitor_stream_enabled": monitor_enabled,
                "enable_auto_start": enable_auto_start, "enable_auto_stop": enable_auto_stop,
                "legal_transitions": legal_transitions(lifecycle_status, stream_status, monitor_enabled)}
    except Exception as e:
        data = {"bound": True, "connected": True, "error": str(e)}
    _health_cache[sid] = {"data": data, "at": now}
    return data


def invalidate_health_cache(sid: str | None = None) -> None:
    if sid:
        _health_cache.pop(sid, None)
    else:
        _health_cache.clear()


def transition_broadcast(sid: str, broadcast_id: str, status: str) -> dict:
    if status not in ("testing", "live", "complete"):
        raise ValueError("invalid transition status")
    creds = load_credentials()
    if not creds:
        raise RuntimeError("YouTube account not connected")
    resp = _yt_client(creds).liveBroadcasts().transition(broadcastStatus=status, id=broadcast_id, part="status").execute()
    invalidate_health_cache(sid)
    return resp
