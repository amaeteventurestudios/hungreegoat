# MODEL_ROUTING.md — Codex Model Routing Policy

## Purpose
Use the cheapest model that is strong enough while preserving engineering quality and weekly allowance.

## Mandatory Usage Gate
Before spawning any costly worker, run:

```bash
/home/aumanah/.local/bin/codex-usage-guard
```

At 70–79% weekly used, conserve aggressively.
At 80%+ weekly used, do not spawn new workers; checkpoint and stop.

## Primary Orchestrator
**Sol Medium**
- architecture
- decomposition
- dependency ordering
- integration review
- phase acceptance
- final verification

## Heavy Implementation / Difficult Debugging
**Terra High**
Use for interrupted complex recovery, Windmill/runtime integration, hard build failures, and complex cross-layer debugging.

## Normal Implementation
**Terra Medium**
Use for React/shadcn, FastAPI CRUD, PostgreSQL models/migrations, Docker/Compose, tests, and ordinary integrations.

## Cheap / Mechanical Work
**Luna Low or Luna Medium**
Use for repository scans, file discovery, repetitive checks, documentation cleanup, mechanical refactors, simple UI edits, and straightforward validation.

## Selective Escalation
**Sol Low / Sol Medium**
Use only for architecture-sensitive code, tricky state/concurrency, difficult audio edge cases, integration review, or unresolved Terra failures.

## Astra
Do not use for routine implementation. Reserve for exceptional architecture/reasoning escalation only.

## Explicit Child Routing
Always set both model and reasoning effort for children; do not rely on inheritance.

Verified explicit child routing in this environment:
- Luna Low
- Terra Medium
- Sol Low

## Failure / Retry Rule
Retry procedural failures at the same tier first. Escalate one tier only when complexity justifies it. Do not jump directly to Astra.

## Current Recovery Rule
Use Terra High for the interrupted Phase 06 Windmill/worker runtime recovery. After stabilization, return to the standard routing policy.
