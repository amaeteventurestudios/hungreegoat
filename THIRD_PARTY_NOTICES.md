# Third-party notices

This file lists every third-party component bundled in, vendored into, or built against
this repository, and what each one requires. Original HUNGREE Goat code and documentation
is `Copyright © 2023–2026 HUNGREE Goat Media` (see `LICENSE`) — everything listed below is
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

Verified directly from each font file's own embedded metadata (the name table inside the
TTF itself — the authoritative source, not the filename or an assumption), via
`strings -e b` on each binary:

| Font family | File(s) | Upstream project | Copyright (as embedded in the file) | License |
|---|---|---|---|---|
| Montserrat | `packages/brand/fonts/Montserrat-{Regular,Medium,SemiBold,Bold,ExtraBold}.ttf` | github.com/JulietaUla/Montserrat, designer Julieta Ulanovsky | Copyright 2011 The Montserrat Project Authors | SIL OFL 1.1 |
| Inter | `packages/brand/fonts/Inter-Variable.ttf` | github.com/rsms/inter, designer Rasmus Andersson | Copyright 2016 The Inter Project Authors | SIL OFL 1.1 |
| Great Vibes | `packages/brand/fonts/GreatVibes-Regular.ttf` | github.com/googlefonts/great-vibes, designer Robert E. Leuschke et al. | Copyright 2010 The Great Vibes Pro Project Authors | SIL OFL 1.1 |

**Redistribution is permitted** under OFL 1.1 (that's the license's purpose — free use,
modification, and embedding in products including commercial ones), subject to its
conditions: the license text must accompany the fonts, copyright notices must be preserved,
modified versions can't claim the original (unmodified) family name (the "Reserved Font
Name" clause), and the fonts can't be sold by themselves standalone (bundling in a larger
product, like this one, is fine).

**Gap found and now fixed**: the root `LICENSE` already referenced "fonts: SIL OFL 1.1," but
the actual license text wasn't committed anywhere. Added
`packages/brand/fonts/OFL-{Montserrat,Inter,GreatVibes}.txt` — the standard OFL 1.1 text
(fetched directly from each project's own upstream repository, not retyped from memory),
each paired with that specific font's actual embedded copyright line above.

## Bundled ambient audio (`apps/player/public/assets/ambience/*.mp3`)

15 short ambient sound-effect loops (birds, campfire, city_traffic, fan, fireplace,
forest_night, ocean, people_talk_inside, rain_city, rain_forest, river, snow,
summer_storm, waves, wind) — part of the player's built-in ambient-sound-mixer feature,
not HUNGREE Goat's radio music catalog (that lives outside Git — see the root README).

**Technical provenance: confirmed, not assumed.** Fetched the same 15 filenames from
`menoc61/lofi-music-website` (the original upstream, before the HUNGREE Goat fork) at
`public/assets/musics/*.mp3` and compared: all 15 match by file size, and two spot-checked
with MD5 (`birds.mp3`, `ocean.mp3`) are byte-for-byte identical. These files came from that
repository, unmodified, just moved to a differently-named directory (`musics/` → `ambience/`).

**Legal/rights provenance: unresolved, flagged rather than assumed.** The upstream repo's
own `LICENSE` file is the full AGPL-3.0 text, but its `README.md` displays a "License: MIT"
badge — an inconsistency in the upstream project itself, not something introduced here (we
correctly followed the actual `LICENSE` file, the legally controlling artifact, when
`apps/player/NOTICE.md` states AGPL-3.0). More importantly for these specific files: neither
the upstream `README.md` nor any other file in that repository documents where the ambient
audio itself was originally sourced from — no credit to a sound library (e.g. Freesound,
Pixabay Audio, Zapsplat), no separate media license. Bundling audio in a code repository
under a code license does not, by itself, establish that the repository owner held (or could
grant) redistribution rights to that audio — and given the upstream project's own
inconsistency about its code license, that assumption is weaker here than it might otherwise
be. **Recommendation, not a decision made here**: before any public release, either (a)
independently identify and document each loop's true original source and license, (b)
replace them with independently-sourced, clearly-licensed (e.g. CC0) royalty-free ambient
loops, or (c) remove the ambient-sound-mixer feature if it's not essential. Not deleted as
part of this pass, per instruction.

## What HUNGREE Goat did NOT reimplement

Per `apps/dj-studio/NOTICE.md`: no DSP algorithm (limiter, LUFS measurement, true-peak
detection, multiband compression, EQ, BPM/key detection, FFT) in either vendored project was
rewritten — HUNGREE Goat's own work there is integration (the library/manifest bridge to the
real catalog, an autopilot bridge for headless mix generation, an offline mastering driver,
storage, and the visual re-skin), not the audio DSP itself.

## Everything else in this repository

`apps/website`, `apps/control`, `packages/brand` (excluding fonts, above),
`packages/ui`, `packages/shared`, `infra/`, and `docs/` are original HUNGREE Goat work —
`Copyright © 2023–2026 HUNGREE Goat Media`, covered by the root `LICENSE`, not by this file.
