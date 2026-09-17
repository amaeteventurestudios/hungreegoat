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
  of upstream's own visual identity. Upstream product name/branding in the operator UI replaced;
  this notice preserves the required attribution.
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
