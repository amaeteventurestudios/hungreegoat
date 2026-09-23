# MODEL_ROUTING.md — Codex Model Routing Policy

## Purpose
Keep the AI Music Studio build efficient by routing work to the cheapest model that is strong enough for the task.

## Current Operating Policy

### Primary Orchestrator
**Sol Medium**
- architecture
- task decomposition
- dependency ordering
- conflict avoidance
- integration review
- phase acceptance
- final verification

### Heavy Implementation / Difficult Debugging
**Terra High**
Use for:
- interrupted complex implementation recovery
- multi-file backend work
- Windmill/runtime integration
- hard build failures
- difficult debugging
- complex cross-layer integration

### Normal Implementation
**Terra Medium**
Use for:
- React/shadcn implementation
- FastAPI CRUD
- PostgreSQL models and migrations
- normal Docker/Compose work
- routine test implementation
- ordinary API integration

### Cheap / Mechanical Work
**Luna Low or Luna Medium**
Use for:
- repository scans
- file discovery
- repetitive checks
- documentation cleanup
- mechanical refactors
- simple low-risk UI edits
- lint/test enumeration
- straightforward validation

### Selective Escalation
**Sol Low / Sol Medium**
Use for:
- architecture-sensitive code
- tricky state/concurrency
- difficult audio pipeline edge cases
- integration review
- unresolved failures after Terra attempts

### Astra
Do not use for routine implementation.
Reserve Astra only for exceptional architecture review or unusually difficult reasoning where Sol is insufficient.

## Explicit Child Routing
When spawning subagents, set both:
- model
- reasoning effort

Do not rely on inheritance from the parent session.

The runtime has been verified to accept explicit child routing for:
- Luna Low
- Terra Medium
- Sol Low

## Failure / Retry Rule
If a worker fails:
1. inspect the failure
2. retry with the same model if the failure is procedural
3. escalate one tier only when complexity justifies it
4. do not jump directly to Astra

## Cost Discipline
The goal is not to maximize model strength. The goal is to use the lowest-cost model that can reliably complete the task.

## Current Recovery Rule
If resuming the interrupted Windmill/worker runtime work from the exhausted session, use **Terra High** to reconstruct the current state from disk/logs and finish the interrupted implementation. After the recovery task is stable, return to the standard routing policy above.
