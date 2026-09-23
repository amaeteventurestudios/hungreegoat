# Orchestration Kernel

## Goal
Every long-running Studio operation must be durable, observable, refresh-safe, and independent of the browser session.

```text
FastAPI command
    ↓
Domain transaction
    ↓
Job record
    ↓
Windmill execution
    ↓
Tagged worker
    ↓
Provider / engine adapter
    ↓
Progress events
    ↓
Domain result + immutable assets
```

## Canonical Rule
PostgreSQL owns domain state.
Windmill owns execution state.

## Job Types
- `producer.plan`
- `music.generate`
- `music.regenerate_section`
- `audio.analyze`
- `audio.waveform`
- `audio.transcode`
- `audio.tempo_transform`
- `audio.pitch_transform`
- `audio.separate_stems`
- `audio.master`
- `audio.export`

## Normalized States
- pending
- queued
- running
- succeeded
- failed
- cancelled

## Job Record
Minimum:
- id
- project_id
- song_id
- job_type
- state
- progress_percent
- current_stage
- input_payload
- result_payload
- error_code
- error_message
- external_execution_id
- retry_count
- created_at
- started_at
- finished_at

## Idempotency
Retryable commands require an idempotency strategy. Duplicate requests must not duplicate irreversible work.

## Progress Stages
Examples:
- preparing
- uploading
- generating
- downloading
- analyzing
- transforming
- separating
- mastering
- persisting
- complete

## Worker Routing
- `ai`
- `audio`
- `separation`
- `mastering`

## Retry
Retry transient failures such as timeouts, 429s with backoff, selected 5xx responses, and safe worker interruptions.

Do not blindly retry invalid input, unsupported media, authentication failure, deterministic provider rejection, or unsupported operations.

## Browser Recovery
Reloading must reconstruct active jobs, progress, outputs, failures, and available next actions from the API.

V1 may poll. API semantics should permit SSE/WebSocket later without changing domain truth.
