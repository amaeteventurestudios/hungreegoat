# Phase 11 — Audio Analysis and Tempo / Remix

## Objective
Analyze audio and create non-destructive tempo/pitch variants.

## Analysis
- BPM
- duration
- sample rate
- channels
- key estimate
- loudness
- peaks

## Engine
- FFprobe
- librosa
- SoundFile
- Rubber Band

## Tempo UI
Presets:
- 90
- 100
- 120
- 140
- 160
- 180
- 200
- Custom

Modes:
- Time Stretch
- Double-Time Feel
- Half-Time Feel
- Pitch + Tempo

Controls:
- Preserve Pitch
- Preserve Formants where supported
- Pitch Semitones
- Transient sensitivity
- Preview
- Apply

Warn on extreme transformations.

## Acceptance
Non-destructive tempo/pitch variants are correctly analyzed, transformed, persisted, and lineage-linked.

## Verified implementation — 2026-09-23

The Studio API queues workspace-scoped, idempotent `audio.analyze` and `audio.tempo`
jobs. The restricted Windmill worker reads an immutable source through its read-only
Studio asset mount. FFprobe measures media properties; a bounded Librosa/SoundFile
pass estimates BPM and key and computes peaks, and FFmpeg EBU R128 measures
integrated loudness. The source is never modified. Tempo/pitch changes are rendered
to a separate FLAC using FFmpeg's [Rubber Band filter](https://www.ffmpeg.org/ffmpeg-filters.html#rubberband),
which supports independent tempo/pitch scaling, transient modes, and formant
preservation. Output intake is lease-bound, size- and duration-limited, validates
media independently, and atomically stores the derived asset, `TempoVersion`, and
`AssetLineage`. A retry resumes an already committed output without re-rendering.

The Tempo workstation selects song audio, shows analysis and measured peaks, offers
BPM presets and custom targets, four modes, pitch/formant/transient controls,
browser tempo preview, extreme-ratio warnings, durable job status, and playback
and downloads of immutable variants. Browser preview is tempo-only; pitch/formant
changes are verified in the worker render. Source BPM may be corrected manually
when the detector is uncertain. Inputs are limited to ten minutes and 0.5–2×
tempo; a transform that would exceed the ten-minute output window is refused.

Real local proof used an original generated rhythmic WAV fixture, ran both jobs
through the restricted worker, persisted analysis and a transformed FLAC, verified
lineage, and confirmed the source SHA-256 was unchanged. No paid provider was used.
