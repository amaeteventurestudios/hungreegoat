# Phase 04 — Orchestration Kernel

## Objective
Connect FastAPI to Windmill and establish durable job execution.

## Work
Windmill service, orchestration client, tagged workers, lifecycle, progress, failure mapping, retry/cancel, UI job progress.

## Acceptance
- long-running mock workflow completes
- browser refresh recovers status
- failure is visible
- retry works
- worker interruption does not corrupt domain state
