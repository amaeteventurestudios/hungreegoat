# Phase 13 — Mastering and Export

## Objective
Produce release-ready output.

## Mastering
- Matchering behind MasteringProvider
- choose target mix
- choose reference track
- master
- compare pre/post
- version masters

## Exports
- WAV
- MP3
- stems package
- FLAC-ready architecture for later

## Preservation
Keep source, mix, reference, and mastered output immutable.

## Acceptance
Mastering and export complete successfully with correct lineage and downloadable delivery assets.

## Verified checkpoint — 2026-09-23

- Matchering 2.0.6 and FFmpeg loudnorm run as bounded leased jobs in the 4 GiB Studio worker. Source and reference mounts remain read-only. Masters are new FLAC assets with persisted source/reference lineage; retries reuse a committed asset.
- WAV 16/24-bit and MP3 128–320 kbps jobs produce validated, immutable audio assets. A stem ZIP has a dedicated `StemPackage` row rather than masquerading as audio; intake verifies the exact four FLAC payloads against registered source SHA-256 hashes.
- The Mastering workspace selects source and optional reference, sets LUFS/true peak, compares source/master A/B, browses versions, and downloads audio or stem packages.
- Real local workflow passed reference-guided and loudness-only mastering, three export formats, Demucs separation, stem package validation/download, lineage checks, and source SHA-256 preservation.
- Verification: 56 PostgreSQL API tests, 16 worker-image tests, 120 browser tests across responsive viewports, migration drift clean, Studio boundary clean.
