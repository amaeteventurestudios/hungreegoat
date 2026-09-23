# Autonomous Execution Contract

## Primary Directive
Codex is authorized to build Hungree Goat AI Music Studio from Phase 00 through Phase 14 continuously without routine human confirmation, subject to the mandatory usage safety policy.

Read:
- `MODEL_ROUTING.md`
- `USAGE_GUARD.md`

Both are mandatory.

## Mandatory Usage Check
Before every major work batch, before every new phase, and before costly delegation, execute:

```bash
/home/aumanah/.local/bin/codex-usage-guard
```

Re-check after meaningful batches and long debugging/research loops.

At **80% weekly usage or greater**, stop new implementation, checkpoint, write the handoff, and stop cleanly. This overrides the normal no-stop-between-phases rule.

## Required Autonomous Behavior
When a question or ambiguity appears:
1. check usage
2. read project docs
3. inspect repository/runtime state
4. consult official upstream docs when needed
5. choose the simplest reversible implementation
6. route work to the cheapest model strong enough
7. implement
8. test/fix/verify
9. document
10. re-check usage
11. continue only if the usage guard permits

## Continuous Phase Execution
Execute Phase 00 → Phase 01 → ... → Phase 14 in sequence while usage remains below the hard-stop threshold.

Intermediate phase completion is an internal checkpoint, not a reason to ask the owner for approval.

## Delegation Strategy
Default coordinator: **Sol Medium**.

Delegate according to `MODEL_ROUTING.md`:
- Luna Low/Medium for cheap mechanical tasks
- Terra Medium for normal implementation
- Terra High for difficult implementation/debugging
- Sol Low/Medium for architecture-sensitive work/review
- Astra only for exceptional escalation

Explicitly set child model and reasoning effort.

## Recovery
When resuming interrupted work:
- inspect `docs/CODEX_HANDOFF.md`
- inspect git status/diff
- inspect execution records
- inspect relevant processes/logs
- continue from disk/runtime state rather than restarting completed work

For the current Phase 06 Windmill/runtime recovery, Terra High is preferred.

## Completion
The run ends only after Phase 14, a true human-only blocker preventing all independent work, or the mandatory 80% usage stop-and-handoff.
