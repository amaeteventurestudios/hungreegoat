# Project and asset contract

Phase 05 extends the authenticated `/api/v1` API. Every lookup is scoped to the
session workspace, with 404 for absent or inaccessible resources. UUID IDs and
UTC timestamps are canonical. Lists return `{items: [...]}` and support bounded
pagination. Mutations retain Origin/CSRF protection.

## Projects and songs

- `GET /projects`, `POST /projects`, `GET/PATCH /projects/{id}`.
- Project fields: id, name, description, tags, created_at, updated_at.
- `GET/POST /projects/{id}/songs`, `GET/PATCH /songs/{id}`.
- Song fields: id, project_id, title, brief, notes, tags, bpm, musical_key, style,
  vocal_mode, target_duration_seconds, created_at, updated_at. BPM is nullable or
  30–300. Vocal mode is auto/instrumental/vocals; target duration is nullable or
  3–600 seconds. These preserve the initial brief for later production planning.
- Creation requires name/title. Text and tag sizes are bounded. Blank names are
  invalid. Updates preserve omitted fields. No destructive deletion in Phase 05.

## Assets

- `GET /projects/{id}/assets`, `POST /projects/{id}/assets/upload`.
- `GET /assets` lists workspace assets with optional project_id/song_id filters.
  Lists accept limit (1–100, default 50) and offset (0 or greater).
- Upload accepts multipart `file` and optional `song_id`; validates that the song
  belongs to the project. Maximum upload 100 MiB. API and web proxy enforce the
  streaming limit, independent of Content-Length. Other request bodies remain
  limited to 1 MiB. Authentication precedes upload processing.
- Probe using a bounded FFprobe subprocess with argument arrays; accept supported
  audio formats only. Do not trust filenames, MIME types or user paths. Reject
  empty/invalid audio, excessive duration and non-audio media with clear errors.
- StorageProvider creates exclusive private immutable objects using generated
  keys. Failed uploads remove their temporary objects. No overwrite operation.
- Public asset metadata: id, project_id, song_id, kind, original_filename,
  media_type, byte_size, sha256, duration_seconds, sample_rate, channels,
  created_at. Never expose filesystem paths or storage keys.
- `GET /assets/{id}`, `/stream`, `/download`, `/lineage`. Authenticated streaming
  supports byte ranges; download uses a safe attachment filename.
- Lineage response is `{items:[{id,parent_asset_id,child_asset_id,operation,
  parameters,created_at}]}`. Transformations add child assets and lineage together.

## Durable jobs and later entities

- `GET /jobs/{id}` and `GET /projects/{id}/jobs` expose normalized state,
  progress_percent, current_stage, error_code/message, timestamps and logical
  result IDs. Provider payloads, secret references and worker tokens stay private.
- States: pending, queued, running, succeeded, failed, cancelled.
- Phase 05 establishes the job/event schema. Execution, cancellation and retry
  are enabled in Phase 06 with the Windmill adapter and durable dispatch.
- Define relational foundations for production plans, generations/versions,
  arrangements, audio analysis, tempo versions, stem sets/stems, mix versions,
  masters and exports. Later phases add their typed commands and validation;
  domain relationships must not be replaced by an unstructured JSON document.

## UI

Projects supports create/edit/search, opening project detail and creating songs.
Song detail preserves metadata/notes/tags, upload/listen/download and asset history.
Library lists real persisted assets. Shared song context restores the selected
song and links the workstation tools to its logical ID. Empty states offer the
next available action. Domain-dependent tools retain prerequisites until enabled
in their phase; no placeholder songs or fabricated jobs.
