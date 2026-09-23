# Product Specification

## Product
Hungree Goat AI Music Studio

Production URL: `https://studio.hungreegoat.com`

## Primary Goal
Move from an idea to generated, edited, tempo-adjusted, stem-separated, mastered, exportable music without manually stitching together many tools.

## 1. Dashboard
Recent projects, active jobs, masters, storage usage, quick New Song, resumable work, mini-player.

## 2. New Project / New Song
Project, title, source idea/song, style, BPM, optional key, vocal mode, duration, tags, notes, optional reference.

## 3. AI Producer
Natural-language brief plus structured style, tempo, key, instrumentation, structure, energy curve, negative instructions, and delivery notes.

Provider selectable from configured AI providers.

## 4. Generation
Provider/model, settings, Version A/B/C/D, progress, duration, status, preview, retry/cancel when supported, approve.

## 5. Listen & Compare
Waveform, A/B switching, metadata, notes, favorite, approve, regenerate, send to arrangement.

## 6. Edit / Arrangement
Timeline, sections, inspector, instrumentation, energy, instructions, revision history, capability-aware regeneration.

## 7. Tempo / Remix
Detected BPM, target BPM, ratio, preserve pitch/formants where supported, pitch semitones, time stretch, double-time, half-time, preview, extreme-ratio warning.

## 8. Stems & Mixing
Vocals/drums/bass/other, mute/solo/play, per-stem level, recombination, downloads.

## 9. Mastering
Source mix, reference track, mastering settings, A/B pre/post, master versions.

## 10. Library / Final Masters
Search/filter assets, songs, versions, stems, masters, exports, lineage, notes, playback, download/export.

## 11. Settings / Integrations
This is a first-class product surface, not developer-only configuration.

Sections:
- Providers
- Audio Engines
- Storage
- Audio Defaults
- Export Defaults
- Workspace
- Appearance
- Health

Provider cards:
- ElevenLabs
- OpenAI
- OpenRouter
- Anthropic/Claude
- future providers

Each provider card supports:
- Connected / Not Connected
- Enabled / Disabled
- masked credential
- Add / Replace credential
- Test Connection
- provider health
- last successful health check
- default model dropdown where applicable
- optional advanced settings

Raw credentials are never re-displayed after storage.

## Global Requirements
- durable job status
- loading/empty/error states
- refresh recovery
- non-destructive versioning
- retry actions
- keyboard accessibility
- responsive layout
- transparent unsupported-capability states
- no hardcoded provider credentials
