# Audio Pipeline

## Principle
All processing is non-destructive. Original and derived audio assets are immutable after successful promotion.

## Ingest
1. validate type and size
2. compute SHA-256
3. probe with FFprobe
4. store immutable source asset
5. persist technical metadata
6. queue analysis

## V1 Inputs
- WAV
- FLAC
- MP3
- M4A/AAC where FFmpeg decodes reliably

Normalize internal processing to WAV/PCM where required by an engine.

## Analysis
Use FFprobe plus librosa/SoundFile where appropriate:
- duration
- sample rate
- channels
- BPM estimate
- BPM confidence
- optional key estimate
- optional key confidence
- peak level
- loudness where supported

Analysis is advisory. Users may override uncertain BPM/key values.

## Waveforms
Use wavesurfer.js for browser playback visualization. Precomputed peaks, if added later, are cache artifacts.

## Tempo / Pitch
Primary engine: Rubber Band.

Record:
- source asset
- source BPM
- target BPM
- ratio
- preserve pitch
- pitch shift
- mode
- processor/version
- output asset

Distinguish:
- literal time stretch
- double-time musical feel
- half-time musical feel
- pitch shift

A 90→180 BPM literal transform is 2.0× and should trigger an extreme-ratio warning.

## Stem Separation
Initial adapter: Demucs.

Normalized stem types:
- vocals
- drums
- bass
- other

Do not make Demucs model details mandatory domain fields.

## Mastering
Initial adapter: Matchering.

Mastering is separate from tempo/pitch transformation.

## Exports
FFmpeg creates derived delivery assets such as:
- WAV
- MP3 320k

Exporting never mutates the master.
