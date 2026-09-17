# DJ Studio — Auto-DJ, Workout Mixes, Mastering

## What this is
A workout-mix factory built into HUNGREE Goat Control: pick a Workout playlist, click **Create & Generate Mix**, and
get back a real, beatmatched, transitioned, mastered WAV recording a few minutes later — without the operator needing
to know anything about DJing, BPM/key, LUFS or true peak. A **Full DJ Console** (the real two-deck engine, re-skinned)
is also reachable for power users at `/dj/index.html`.

## Installed components (vendored, not npm/pip dependencies)
- **Aurdour** — `github.com/bettercallzaal/Aurdour`, commit `02863ca51f293730f4078b0990db8b0fc4c41483`, **MIT**. A
  static, no-build two-deck Web Audio DJ app (waveforms, FlowMode auto-DJ, real-time MediaRecorder capture). Vendored
  under `apps/dj-studio/`. See `apps/dj-studio/NOTICE.md` for every modification made to it.
- **noisyloop/mastering** — `github.com/noisyloop/mastering`, commit `5e59ec3bc9e0e64ba3c13c700d36a7e7a422325b`,
  **ISC**. Pure ES-module DSP (LUFS measurement, multiband compression, lookahead limiting, WAV encoding), run offline
  (not real-time). Vendored under `apps/dj-studio/vendor/mastering-dsp/`.
- Both licenses are permissive; nothing copyleft was introduced.

## Architecture (kept deliberately distinct from the existing catalog)
```
LIBRARY (tracks, unchanged)  →  PLAYLISTS (kind='workout' is just an ordinary playlist)
        │                                         │
        │                         WORKOUT PROFILE (workout_profiles — how Auto-DJ should
        │                                          use the pool: energy curve, transition
        │                                          character, mastering preset)
        ▼                                         ▼
   dj.manifest() ──────────────▶  DJ ENGINE (vendored Aurdour, driven headlessly)
                                              │
                                              ▼
                                  MASTERING (vendored DSP + a corrective ffmpeg loudnorm
                                             pass — see "Why a loudnorm pass" below)
                                              │
                                              ▼
                                  MIXES (mixes / mix_tracks — brand-new recordings,
                                         config.MIXES_DIR, never re-enters Library)
```
- `hgc/dj.py` is the *only* bridge between the real Library and Aurdour: `manifest()` shapes a playlist's tracks the
  way Aurdour's `Library.js` already expects (it has a native `streamUrl` direct-load path used for streaming
  sources), pointing `streamUrl` at the existing `/v1/tracks/{id}/audio.mp3` endpoint. No file is ever copied.
- `config.MIXES_DIR` (`MEDIA/mixes/`) is outside `MUSIC_DIR`, so `catalog.scan_station()` — which only ever walks each
  station's own `music_dir` — never sees it. No exclusion list was needed.
- `hgc/dj_orchestrator.py` (`python -m hgc.dj_orchestrator <analyze|generate> ...`) is the process that actually runs
  the pipeline, driving a headless browser via Playwright as the *execution engine* for the real JS — never a
  reimplementation of BPM detection, mastering DSP, or the DJ engine itself.

## The 90 BPM / "workout feel" requirement
`tracks.dj_bpm` stores the analyzed real tempo and is never overwritten. `workout_profiles.max_tempo_adjust_pct`
bounds how far a workout profile is allowed to nudge playback speed (a few percent, via the deck's own tempo control)
— there is no double-time/half-time playback trick that would shift pitch or make the music unrecognizable.

## Why a corrective `loudnorm` pass after the DSP mastering
Smoke-testing found the vendored DSP's own `measureLUFS`/limiter can land several LU off *its own stated target*
(confirmed independently with ffmpeg's `ebur128` filter on the same file — e.g. it reported achieving −14.7 LUFS on a
file ffmpeg measured at −11.6 LUFS, with the true peak also over the ceiling it claimed to enforce). Per the explicit
requirement not to trust a mastering tool's own self-reported numbers, `dj_orchestrator.py` uses the DSP chain only
for its creative processing (compression/saturation/EQ character) and then runs ffmpeg's own two-pass `loudnorm` as
the pass that actually delivers the mandated LUFS/true-peak numbers, and re-measures the *output* file independently
with `ebur128` before saving it. `mixes.measured_lufs` / `measured_true_peak_db` are always these independently
re-measured numbers, never the DSP's self-report.

## A real environmental constraint: headless real-time recording on this Pi
Real-time capture (Stage 1) uses Chromium's `MediaRecorder` + `AudioContext.createMediaStreamDestination()`, which is
inherently wall-clock-bound. Measured directly on pi-node-01: Playwright's default headless launch silently picks the
`chrome-headless-shell` binary, whose `<audio>`-element pipeline produced **near-total silence** here even though the
deck reported `isPlaying=true` and the AudioContext reported `state: running` — confirmed with a real `AnalyserNode`
tap (peak sample = 0) and by the deck's own playback position barely advancing. `dj_orchestrator.py` launches Stage 1
with `channel="chromium"` (the full browser) instead, which produces real, audible, correctly-paced playback. There
is still a real, load-dependent startup ramp — a "5 minute" (300 s) request typically yields ~250 s of actual
captured audio on this Pi while the production broadcast is also running (verified: 300 s requested → 250.92 s
captured, independently ffprobe'd). `mixes.target_duration_sec` and `.actual_duration_sec` are both stored so this is
always visible, never silently hidden.

## Storage
- `MEDIA/mixes/*.wav` — finished, mastered mixes (what `Mixes` lists and plays).
- `MEDIA/mixes/.raw/*` — intermediate raw recording + pre-loudnorm DSP output, kept for now (not auto-deleted) —
  useful for debugging, but safe to clear; nothing else references them once a mix reaches `status='ready'`.

## New DB entities
- `workout_profiles` — one row per workout type (General/Strength/Treadmill/Cycling/Rowing/HIIT), seeded on first run.
- `mixes` / `mix_tracks` — one row per generated mix and its real per-track recipe (source track id, BPM/key at the
  time, start offset, transition timing).
- `tracks.dj_bpm` / `dj_key` / `dj_energy` / `dj_analyzed_at` / `dj_analysis_version` — analysis results, additive
  columns on the existing table; nothing else about `tracks` changes.

## Entry points
- Control UI: **Workout DJ** in the left nav (`#/workout`) — create/generate/monitor/play/download mixes, kick off
  analysis.
- Full DJ Console (power users): `/dj/index.html`, same-origin, shares the operator's Control session cookie.
- `dj.hungreegoat.com` is not required for any of the above to work — it is only relevant once the gateway is told to
  route that hostname to Control's existing `/dj` mount, which is an infra/DNS task, not a code change.

## Re-running the acceptance test
```
# 1. Mint a session (or sign in normally and grab the hgc_session cookie):
python -m hgc  # or: python -c "from hgc import auth; print(auth.issue('operator'))"

# 2. Create + generate a mix (station must have a playlist with kind='workout' and analyzed tracks):
curl -s -b "hgc_session=<token>" -X POST http://127.0.0.1:8090/api/dj/mixes \
  -H 'Content-Type: application/json' \
  -d '{"station":"lofi","workout_type":"general","intensity":"moderate","target_duration_sec":300}'
# -> {"id": N, ...}
curl -s -b "hgc_session=<token>" -X POST http://127.0.0.1:8090/api/dj/mixes/N/generate \
  -H 'Content-Type: application/json' -d '{"playlist":"workout"}'

# 3. Poll GET /api/dj/mixes/N until status is "ready" (creating -> recording -> mastering -> ready).

# 4. Independently verify (never trust the mastering UI's own numbers):
ffprobe -v error -show_entries format=duration:stream=sample_rate,channels -of json MEDIA/mixes/mix-N.wav
ffmpeg -nostdin -i MEDIA/mixes/mix-N.wav -af ebur128=peak=true -f null -
```

## Known limitations / next steps
- Actual captured duration runs somewhat below the requested target under normal production load (see above) —
  acceptable and always disclosed via `actual_duration_sec`, but padding the requested duration to compensate would
  be a reasonable follow-up.
- No Dashboard summary card or a "Auto-DJ this playlist" shortcut from the Playlists page yet — `Workout DJ` in the
  left nav is the only current entry point.
- Workout Profiles (`workout_profiles`) are seeded with sensible defaults and fully CRUD-able via `/api/dj/profiles`,
  but have no dedicated Control UI yet (JSON API only).
- `MEDIA/mixes/.raw/` intermediates are not automatically pruned.
- No automated regression test suite yet for "playlist membership never copies files" / "Mix deletion never touches
  Library" / etc. — manually verified during the acceptance test (Library track count and all source-file checksums
  confirmed unchanged before/after); worth codifying as real tests.
