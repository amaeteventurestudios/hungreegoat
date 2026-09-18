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

## Real tempo acceleration (not "double-time interpretation")
The owner listened to early mixes and found them musically useless — every track played at its original tempo, only
labeled "Moderate"/"Intense". Root cause: `tempo_adjust_pct` was always `0`; nothing in the pipeline ever actually
changed playback speed. Fixed by driving Aurdour's own existing tempo control, not writing new DSP:
`dj-autopilot.js` calls each deck's real `Deck.setPlaybackRate(rate)` (wavesurfer's own rate control) and
`Deck.setKeyLock(true)` (native `HTMLMediaElement.preservesPitch` — pitch-preserving time-stretch built into every
browser) on the first track and on every subsequent `AutoTransition`-driven deck, *before* that transition starts, so
the mix never drops back to original speed partway through. `dj_orchestrator.py`'s `_resolve_tempo()` turns an
operator's choice — Automatic (maps easy/moderate/high/intense to +0/25/50/75%), Original, a fixed Boost %, or a
Target BPM — into a concrete multiplier before the browser ever sees it. `tracks.dj_bpm` (source) is never
overwritten; `mix_tracks.effective_bpm`/`tempo_adjust_pct`/`key_lock` record what was actually played. Verified
directly (not just trusted): a real generated mix's own logged rate was `deck.currentRate = 1.5` for a +50% request,
`preservesPitch: true`, and the saved recipe shows exactly `source_bpm × 1.5 = effective_bpm` on every track (75→112.5,
100→150, 143→214.5 BPM).

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
is still a real, load-dependent startup ramp, worse with tempo acceleration active (more per-sample time-stretch work
for the same wall-clock recording window) — three independent 300s-target recordings measured 250.9s (83.6%), 257.8s
(85.9%), and 241.1s (80.4%, tempo on) of actual captured audio. `dj_orchestrator.py` mitigates this with a measured
padding-and-trim, not a blind fudge: it requests `duration × 1.25` wall-clock seconds from the recorder, then — after
converting the download to WAV — trims the result back down to the real requested duration (with a short fade at the
cut) if it overshot. This is a *disclosed mitigation*, not a precision guarantee: the actual shortfall ratio varies
with live system load (~80–86% observed), so a request can still occasionally land outside the padded window on a
particularly loaded run. Verified working: a padded 300s request came back at 300.96s post-trim (within the ±5s
acceptance band) on a real generated mix. The clean, permanent fix — removing this class of error entirely — is
switching generated-Mix rendering to something deterministic/offline (e.g. ffmpeg's own `atempo` + `acrossfade`
filters driven by the same recipe FlowMode already computes, run as fast as the CPU allows rather than wall-clock-
bound); noted as a next step, not attempted in this pass given the scope of re-verifying a second rendering path.
`mixes.target_duration_sec` and `.actual_duration_sec` are both stored so the real result is always visible, never
silently hidden.

## A second real environmental constraint: the Pi's limited RAM under concurrent load
This Pi has 3.7 GB RAM + 2 GB swap, shared between the live 24/7 YouTube broadcast (Liquidsoap + FFmpeg), this Control
process, and whatever else is running. A full generate (record → convert → DSP-master → loudnorm-correct → verify)
pushes a large in-memory buffer (tens of MB of decoded PCM) through a headless Chromium's V8 heap twice (once for
real-time recording, once for offline DSP mastering) — during one real test run here, the orchestrator subprocess was
killed outright with no exception ever logged (consistent with the kernel OOM-killer sending SIGKILL, which no
Python-level `except` can intercept) while swap was at 1.4/2.0 GB used. Both intermediate files (the raw recording
and the DSP-mastered WAV) were found complete and valid on disk afterward — recording and mastering themselves had
already finished; only the final loudnorm-correction/verification/save step was lost — so that run was salvaged by
re-running just the remaining steps directly rather than the full ~10-minute pipeline. This is a real operational
risk worth the owner's awareness on a Pi this size, not something code alone can fully eliminate; retrying (the
generate endpoint is idempotent to call again on a fresh mix row) has so far always succeeded on the second attempt.

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
- Duration accuracy is a disclosed mitigation (padding + trim), not an exact guarantee — see above; the real fix is
  deterministic/offline rendering.
- The Pi can run low enough on memory under concurrent load (live broadcast + a generate job) that the orchestrator
  subprocess is killed outright — see above; a generate that fails this way is usually salvageable (the raw/DSP
  intermediates under `MEDIA/mixes/.raw/` often survive) or safely retryable on a fresh mix row.
- `MEDIA/mixes/.raw/` intermediates are not automatically pruned.
- `apps/control/tests/test_dj_studio.py` (stdlib `unittest`, run with
  `~/hungree-goat/venv/bin/python -m unittest tests.test_dj_studio -v` from `~/hungree-goat/app`) covers the
  data-layer invariants (Library/Mixes separation, playlist-membership idempotency, profile CRUD, tempo math,
  manifest playlist filtering, duration persistence, auth/path-traversal, skin draft staging) — it does not and can't
  cover FlowMode's own in-browser track-selection/recent-repeat-avoidance logic; that's only exercised by the manual
  end-to-end test above.
- Workout Profiles have a full Control UI now (Workout DJ page: list/create/edit/duplicate/enable/delete, plus a
  "Load from profile" selector on Create Workout Mix) — `tempo_mode`/`tempo_boost_pct`/`target_bpm` are stored per
  profile but a profile's tempo choice isn't yet auto-applied at generate time without the operator explicitly
  loading it into the form first (i.e. picking a workout type alone doesn't imply its profile's tempo default).
- `dj.hungreegoat.com`'s nginx vhost is written and ready (`infra/gateway/nginx/dj.hungreegoat.com.conf`) but not
  deployed — no shell access to the gateway host from here (a restricted tunnel-only SSH key). The owner needs to
  re-run `infra/gateway/install-hetzner.sh` (or apply the equivalent nginx+certbot steps by hand) on the gateway.
