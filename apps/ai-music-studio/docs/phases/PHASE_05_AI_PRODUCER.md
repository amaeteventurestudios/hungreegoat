# Phase 05 — Orchestration Kernel

## Objective
Create durable long-running execution through Windmill.

## Work
- Windmill deployment
- OrchestrationClient
- tagged ai/audio/separation/mastering workers
- job lifecycle
- progress/events
- retry/backoff
- cancellation where safe
- idempotency
- browser refresh recovery
- UI job status

## Acceptance
Codex proves long-running mock jobs, failure persistence, retry, recovery after refresh, and worker interruption behavior, then continues.
