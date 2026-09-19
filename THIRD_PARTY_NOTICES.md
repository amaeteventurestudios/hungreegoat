# Third-party notices

This file lists every third-party component bundled in, vendored into, or built against
this repository, and what each one requires. Original HUNGREE Goat code and documentation
is `Copyright © 2023–2026 Amaete Umanah` (see `LICENSE`) — everything listed below is
someone else's work, used here under its own license.

This is a documentation file, not a legal opinion — see the licensing-analysis note in
`docs/RECOVERY.md` for the caveats, and get your own legal review before any public release.

## Bundled / vendored source code

| Component | Path | Upstream | Copyright holder | License | License text | Modified? |
|---|---|---|---|---|---|---|
| lofi-music-website (fork) | `apps/player` | github.com/menoc61/lofi-music-website, via fork `amaeteventurestudios/lofi--afrobeats-music-website` | Gilles Momeni (menoc61) | AGPL-3.0 | `apps/player/LICENSE` | Yes — see `apps/player/NOTICE.md` for exactly what was kept vs. replaced |
| Aurdour (DJ engine) | `apps/dj-studio` (most of it — see `apps/dj-studio/NOTICE.md` for the file-by-file breakdown) | github.com/bettercallzaal/Aurdour, commit `02863ca5` | "Ardour to Web Audio Player" (2024) | MIT | `apps/dj-studio/LICENSE.aurdour` | Yes — re-skinned, integrated with HUNGREE Goat's backend; DSP/detection algorithms themselves unmodified |
| mastering (mastering DSP) | `apps/dj-studio/vendor/mastering-dsp` | github.com/noisyloop/mastering, commit `5e59ec3b` | SUP3RMASS1VE (2026) | ISC | `apps/dj-studio/vendor/mastering-dsp/LICENSE.mastering` | One line repointing an import to a locally vendored copy of `fft.js`; no DSP logic changed — see `apps/dj-studio/NOTICE.md` |
| fft.js (vendored) | `apps/dj-studio/vendor/mastering-dsp/dsp/fft-lib.js` | npm `fft.js@4.0.4` | (see npm package) | MIT | inline comment in `fft-lib.js`; upstream package for full text | Export syntax only (`module.exports` → `export default`), no logic change |

## Runtime / build dependencies (not vendored — installed separately, keep their own license)

| Component | Used by | License |
|---|---|---|
| Liquidsoap 2.4.5 | Audio engine (`infra/beelink/`, `infra/pi/` — runs as its own Docker container, not linked into this code) | GPL-2.0 |
| FFmpeg | Video encoding (`apps/control/hgc/streamer.py` shells out to the system `ffmpeg` binary) | LGPL/GPL depending on the build's configured codecs |
| React, React DOM | `apps/player` (declared npm dependencies, not vendored source) | MIT |
| FastAPI, Uvicorn, Pillow, mutagen, psutil, itsdangerous, python-multipart | `apps/control` backend (declared pip dependencies — see `apps/control/requirements.txt` / `infra/beelink/requirements.txt`) | Each package's own (predominantly MIT/BSD-family) |

Standard practice: declared npm/pip dependencies installed at build time aren't vendored
into this repository's history, so they're listed here for completeness but each keeps its
own upstream license/notice — check the package itself if you need the full text.

## Fonts

| Font | Path | License |
|---|---|---|
| Montserrat (Regular/Medium/SemiBold/Bold/ExtraBold) | `packages/brand/fonts/` | SIL Open Font License 1.1 |
| Inter (Variable) | `packages/brand/fonts/` | SIL Open Font License 1.1 |
| Great Vibes | `packages/brand/fonts/` | SIL Open Font License 1.1 |

**Gap found during this audit**: the root `LICENSE` already referenced "fonts: SIL OFL 1.1,"
but the actual OFL 1.1 license text was not committed anywhere alongside these font files —
only the font binaries themselves. The OFL requires the license text to accompany the font.
Fix: add the standard OFL 1.1 license text (e.g. as `packages/brand/fonts/OFL.txt`) before
any public release. Not done as part of this pass — flagging rather than guessing at exact
placement/wording you'd want.

## What HUNGREE Goat did NOT reimplement

Per `apps/dj-studio/NOTICE.md`: no DSP algorithm (limiter, LUFS measurement, true-peak
detection, multiband compression, EQ, BPM/key detection, FFT) in either vendored project was
rewritten — HUNGREE Goat's own work there is integration (the library/manifest bridge to the
real catalog, an autopilot bridge for headless mix generation, an offline mastering driver,
storage, and the visual re-skin), not the audio DSP itself.

## Everything else in this repository

`apps/website`, `apps/control`, `packages/brand` (excluding fonts, above),
`packages/ui`, `packages/shared`, `infra/`, and `docs/` are original HUNGREE Goat work —
`Copyright © 2023–2026 Amaete Umanah`, covered by the root `LICENSE`, not by this file.
