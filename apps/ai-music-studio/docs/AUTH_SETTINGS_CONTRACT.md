# Authentication and settings contract

Implementation target for Phases 03–04. All endpoints use `/api/v1`.
Canonical workspace context comes from the authenticated session. Every query
must include that workspace; clients cannot authorize themselves with an ID.

## Session
- `GET /auth/session`: `{authenticated, user, workspaces, active_workspace_id, csrf_token}`.
  Unauthenticated responses return false and null identity/token, with HTTP 200.
- `POST /auth/login`: `{email, password}` → session response and HttpOnly cookie.
- `POST /auth/logout`: revoke session, expire cookie, HTTP 204.
- `POST /auth/password`: `{current_password,new_password}` → revoke sessions, 204.
- Owner bootstrap is a CLI action; there is no public registration endpoint.

User: `{id,email,display_name}`. Workspace: `{id,name,role}`.
Session cookie is opaque, random, hashed in PostgreSQL, expiring and revocable.
Production uses `__Host-studio_session`, Secure, HttpOnly, SameSite=Lax, Path=/.
Development uses an equivalent non-Secure cookie only on loopback HTTP.
Every unsafe browser request validates Origin against `STUDIO_PUBLIC_URL`.
Authenticated writes also require the session-bound `X-CSRF-Token` returned by
the session endpoint. Login errors are generic and attempts are throttled.
Authentication/settings responses use `Cache-Control: no-store`.

## Workspace settings
- `GET /settings` and `PATCH /settings` return the full typed settings document.
- `GET /settings/system` returns normalized storage/engine availability.

```json
{
  "workspace": {"name": "My studio"},
  "appearance": {"theme": "light"},
  "audio": {"sample_rate": 44100, "bpm": 120},
  "exports": {"format": "wav", "bit_depth": 24, "mp3_bitrate_kbps": 320},
  "providers": {"default_producer": null, "default_music": null}
}
```

Patch accepts partial sections but validates the merged result. Sample rates are
44100/48000, BPM 30–300, themes light/dark/system, export formats wav/mp3, bit depths
16/24, MP3 bitrates 128/192/256/320. Provider defaults are normalized provider IDs.

## Providers (Phase 04)
- `GET /settings/providers` → `{items: ProviderConfig[]}`.
- `PATCH /settings/providers/{provider}` → provider config; enabled/default_model.
- `PUT /settings/providers/{provider}/credential` with `{api_key}` → masked config.
- `DELETE /settings/providers/{provider}/credential` → masked empty config.
- `POST /settings/providers/{provider}/health-check` → normalized health result.
- `GET /settings/providers/{provider}/models` → `{items:[{id,label}],source}`.

Provider IDs: `openai`, `openrouter`, `anthropic`, `elevenlabs`.
Config fields: provider, category, enabled, credential_present, masked_secret,
connection_status, default_model, capabilities, health_status, last_health_check_at,
last_successful_health_check_at, updated_at, usage. Never expose secret references,
raw keys, provider error bodies, or credential-bearing URLs. Connection states are
not_configured/unverified/connected/error; health is unknown/healthy/degraded/unavailable.
Usage always declares `available`; unavailable quota is not fabricated as zero.

## Errors and proxy
Errors use `{error:{code,message,details:{}}}`. Validation errors must omit input
values so passwords/keys cannot be echoed. The browser calls a same-origin web
proxy that forwards cookie, Origin, CSRF and necessary content headers to the fixed
server-only API origin. It must reject `/internal` paths and must not accept an
arbitrary upstream URL. No provider calls occur in browser components.

## Verification
Test bootstrap, login/logout/expiry/revocation, invalid Origin/CSRF, throttling,
cross-workspace isolation, settings restart persistence, cookie flags, redaction,
provider secret rotation/deletion, and browser refresh/auth recovery. Secret files
and key material stay outside source with restricted permissions.
