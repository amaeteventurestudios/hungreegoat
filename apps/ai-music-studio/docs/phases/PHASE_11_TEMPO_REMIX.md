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
