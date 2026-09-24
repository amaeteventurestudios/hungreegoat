# Phase 12 — Stem Separation and Mixing

## Objective
Build a complete normalized stems workflow.

## Engine
Demucs behind StemSeparator.

## Stems
- vocals
- drums
- bass
- other

## Mixer
- play
- mute
- solo
- per-stem volume
- individual stem download
- recombine
- mix versions

## Acceptance
Real fixture separation works, stem lineage is correct, and recombined mixes are non-destructive.

## Implementation and verification

- `audio.separate` and `audio.mix` are idempotent, leased Studio jobs. The API creates a stem-set record, validates each four-label FLAC intake, and reuses already committed stem assets on a safe retry. It also creates immutable mix versions with serialized version numbers and lineage to all four inputs.
- `StemSeparator` invokes the pinned official Demucs 4.0.1 `htdemucs` model on normalized 44.1 kHz stereo audio. The model weights are baked into the worker image. CPU input is capped at three minutes; model chunks are seven seconds. A read-only asset mount and bounded output intake protect originals.
- The responsive mixer offers synchronized playback, mute, solo, gain, individual downloads, and saved mix history. Mute/solo are monitoring controls; the saved mix uses gain levels.
- The real local fixture workflow passed: four stored stem labels, source lineage for each, a rendered mix with four parent edges, and an unchanged original SHA-256. API and browser regression cover idempotency, scoped access, upload replay, mixer controls, and a saved version.

The archived [Demucs 4 source and model instructions](https://github.com/facebookresearch/demucs) document the four-source output and `htdemucs` engine. The observed model limit and worker process ceiling are captured in ADR-025.
