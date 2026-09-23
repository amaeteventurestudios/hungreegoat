# Product Specification

## Product
Hungree Goat AI Music Studio

Production URL: `https://studio.hungreegoat.com`

## Primary Goal
Move from idea to generated, edited, tempo-adjusted, stem-separated, mastered, exportable music without manually stitching together many tools.

## Screens
### 1. Dashboard
Recent projects, active jobs, approved masters, storage usage, quick New Song, resumable work, mini-player.

### 2. New Project / New Song
Project, title, source idea/song, style, BPM, optional key, vocal mode, duration, tags, notes, optional reference.

Primary action: `Generate Production Plan`.

### 3. AI Producer
Natural-language request plus structured output: style, tempo, key, instrumentation, structure, energy curve, negative instructions, delivery notes.

### 4. Generation
Provider/model, settings, Version A/B/C/D, progress, duration, status, preview, retry/cancel when supported, approve.

### 5. Listen & Compare
Waveform, A/B switching, metadata, notes, favorite, approve, regenerate, send to arrangement.

### 6. Edit / Arrangement
Timeline, sections, selected-section inspector, instrumentation, energy, instructions, revision history, capability-aware section regeneration.

### 7. Tempo / Remix
Detected BPM, target BPM, ratio, preserve pitch, preserve formants where supported, pitch semitones, time stretch, double-time, half-time, preview, extreme-ratio warning.

### 8. Stems & Mastering
Vocals/drums/bass/other, mute/solo/play, progress; mastering source/reference/settings/output.

### 9. Library / Final Masters
Search/filter assets, versions, stems, masters, exports, lineage, notes, playback, download/export.

### 10. Settings / Integrations
AI providers, music generation, separator, tempo engine, mastering engine, credential status, defaults, storage, workspace, appearance.

## Global Requirements
- durable job status
- loading/empty/error states
- refresh recovery
- non-destructive versioning
- retry actions
- keyboard accessibility
- responsive layout
- transparent unsupported-capability states
