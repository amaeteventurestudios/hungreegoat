# NOTICE — licensing and provenance of HUNGREE Goat DJ Studio

`apps/dj-studio` integrates two upstream open-source projects rather than reimplementing DJ
mixing or mastering DSP. Both are permissively licensed; neither requires network-source
disclosure, but their notices are preserved here and in their own vendored files.

## DJ engine — Aurdour

Source: https://github.com/bettercallzaal/Aurdour, commit `02863ca51f293730f4078b0990db8b0fc4c41483`
(2026-09-12). License: MIT (see `LICENSE.aurdour`, copyright "Ardour to Web Audio Player", 2024).

This directory is `Aurdour/web/` verbatim (a static, no-build two-deck DJ app — `index.html` +
`player.js` + `dj/*.js` ES modules, no bundler required), plus HUNGREE Goat modifications:

- `index.html` / `styles.css`: re-skinned to the HUNGREE Goat Control design system (dark
  navy/gold palette, `packages/brand/tokens.css` colors, HUNGREE Goat header/branding) instead
  of upstream's own visual identity. Upstream product name/branding in the operator UI replaced —
  including the first-run onboarding tour's own "Welcome to AURDOUR DJ" copy, the page's
  `og:title`/`apple-mobile-web-app-title` meta tags, and `manifest.webmanifest`'s PWA
  name/short_name, all now say HUNGREE Goat instead.
- Second branding pass (production correction pass, 2026-09-18): the first pass above only
  covered the main operator console. This pass found and fixed the remaining user-visible and
  exported/shared surfaces still saying "AURDOUR": the standalone `audience.html` (title + header
  logo), `overlay.html`/`obs-overlay.html` (titles, used as OBS browser-source overlays),
  `manifest.webmanifest`'s 512×512 home-screen icon (had "AURDOUR" baked into the SVG artwork
  itself, not just the name field), `dj/Setlist.js`'s share-card watermark image and share-sheet
  HTML (both shown to and shareable by the operator), every exported filename across
  `dj/Setlist.js`/`dj/Recorder.js`/`dj/CloudSync.js`/`dj/Storage.js` (mix recordings, CUE sheets,
  setlist exports, cloud backups — files that land on the operator's own disk with the product
  name in the filename), the CUE sheet's own `REM`/`TITLE`/`FILE` content, `dj/PluginManager.js`'s
  bundled-plugin author field, and `dj/Audius.js`'s `app_name` identifier sent to the public
  Audius API (this one was actually a correctness fix, not just cosmetic — a third-party service
  should see our app's identity, not the vendored upstream's). `player.js`'s two console.log
  startup messages are fixed too, for consistency, though they were already harmless
  (devtools-only, never operator-visible UI).
  Deliberately left alone: `localStorage` key prefixes, IndexedDB database names, BroadcastChannel
  channel names, and the drag-and-drop `application/x-aurdour-track` MIME type string, all still
  say "aurdour". These are internal wiring with zero user-facing surface — nothing renders them,
  no exported file contains them — and several (BroadcastChannel names in particular) must match
  identically across `audience.html`/`overlay.html`/`obs-overlay.html`/`StreamBroadcast.js` to keep
  working, so renaming them would be pure risk for no visible benefit. This notice preserves the
  required attribution either way.
- `dj/Library.js`: `loadManifest()` now fetches `/api/dj/manifest?station=...&playlist=...` from
  HUNGREE Goat Control instead of the static `data/manifest.json` demo file. Everything else
  (FlowMode auto-DJ, AutoTransition crossfading, Recorder, BpmDetector, HarmonicMixer, Deck, FX,
  etc.) is unmodified upstream code, driven through the same `streamUrl`-based track path
  upstream already supported for streaming sources — see `dj_orchestrator.py` and `hgc/dj.py` for
  the integration, not this directory.
- `dj-autopilot.js` (new file, HUNGREE-Goat-specific): a thin, documented bridge that lets
  `dj_orchestrator.py` drive a real FlowMode session headlessly via a `?autopilot=1` URL
  parameter and a `window.__hgcAutopilot` status object, instead of simulating mouse clicks
  through the full UI. Does not modify any upstream file's own behavior when autopilot is off.

### BPM/key analyzer specifically

`dj/bpm-worker.js` and `dj/BpmDetector.js` are unmodified upstream Aurdour files (same commit,
same MIT license as above) — HUNGREE Goat did not write a BPM/key detector. `detectBPM()` is a
low-pass-filtered onset-energy/autocorrelation beat detector; `detectKey()` is a chromagram
(pitch-class profile) matched against major/minor key templates via the Krumhansl-Schmuckler
method. `hgc/dj_orchestrator.py`'s `analyze` subcommand calls these exact functions (via
`apps/dj-studio/tools/analyze.html`, a thin harness that loads `bpm-worker.js` outside its
normal Web Worker context and calls `detectBPM`/`detectKey` directly on a decoded track buffer)
rather than reimplementing tempo/key detection — see `hgc/dj.py`'s `save_analysis()` for where
the results land (`tracks.dj_bpm`/`dj_key`, never overwriting anything tag-derived).

## Mastering DSP — noisyloop/mastering

Source: https://github.com/noisyloop/mastering, commit `5e59ec3bc9e0e64ba3c13c700d36a7e7a422325b`
(2026-07-10). License: ISC (see `vendor/mastering-dsp/LICENSE.mastering`, copyright SUP3RMASS1VE, 2026).

`vendor/mastering-dsp/dsp/` is upstream's `web/lib/dsp/` verbatim (pure ES module DSP functions —
LUFS measurement, true-peak detection, a lookahead limiter, multiband compression, EQ, saturation,
a WAV encoder — no reimplementation of any of this by HUNGREE Goat). `vendor/mastering-dsp/presets/`
is upstream's genre-preset structure, used as the basis for HUNGREE Goat's own "workout_streaming"
preset (`-14 LUFS` / `-1 dBTP`, our choice, not a platform requirement — see `hgc/dj.py`).

One modification, both documented inline at the change: `dsp/fft.js`'s `import FFT from 'fft.js'`
(an npm package resolve) is repointed at a locally vendored copy, `dsp/fft-lib.js` — the npm
package `fft.js@4.0.4` (MIT) fetched from jsdelivr and given a one-line `export default` instead
of `module.exports` so it loads as a native browser ES module (this app has no bundler). No DSP
logic in that file was changed.

Driven **offline**, not in real time: `dj_orchestrator.py` loads a recorded mix's raw audio into
a headless browser page, calls these DSP functions directly on the decoded buffer, and writes the
result with the vendored `encodeWAV()` — mastering a multi-minute mix takes seconds of CPU time,
not wall-clock minutes.

## What was NOT changed
No DSP algorithm (limiter, LUFS, BPM/key detection, EQ, compression, FFT) in either project was
rewritten by HUNGREE Goat. Our work is integration: the Library/manifest bridge, the autopilot
bridge, the offline mastering driver, storage, database, and this re-skin.

The remainder of the hungreegoat monorepo is separate software and is not covered by this notice.
