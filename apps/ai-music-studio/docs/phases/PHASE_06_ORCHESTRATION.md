# Phase 06 — Orchestration Kernel

## Objective
Build the durable long-running job backbone.

## Job Types
- producer.plan
- music.generate
- audio.analyze
- audio.tempo_transform
- audio.pitch_transform
- audio.separate_stems
- audio.master
- audio.export

## Work
- Windmill
- queues/workflows
- worker tags
- retries/backoff
- progress
- status
- persisted errors
- retry action
- cancellation where safe
- refresh recovery
- idempotency

## Acceptance
Browser may close while jobs continue. Job state survives refresh and worker interruption.
