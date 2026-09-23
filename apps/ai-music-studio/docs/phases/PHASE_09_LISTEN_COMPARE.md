# Phase 09 — Listening, Waveforms and A/B Comparison

## Objective
Create a proper generation-review workstation.

## Work
- wavesurfer.js
- waveform rendering
- playback
- seek
- duration
- A/B switching
- synchronized comparison
- notes
- favorite
- approve
- reject
- regenerate
- version metadata

## Acceptance
User can confidently review, compare, annotate, and approve generated versions.

## Verified implementation — 2026-09-23

The Compare workstation loads immutable generated assets through the authenticated
Studio stream endpoint and renders two WaveSurfer waveforms. Playback is exclusive
between slots and transfers the current position when switching; waveform clicks
seek. Version review is scoped to the active workspace and persists notes, favorite,
approval, or explicit rejection without changing any audio asset. Approval and
rejection are mutually exclusive in both the API and database. The regenerate link
returns to the selected song's Generation workflow; it does not silently call a
paid provider. Provider request metadata remains visible for traceability.

Fixture-based API and browser tests verify review persistence and four responsive
viewport flows without charging a music provider. Live provider playback remains
conditional on credentials and a generated version, not a prerequisite to verify
the local review implementation.
