# Autonomous Execution Contract

## Primary Directive
Codex is authorized to build Hungree Goat AI Music Studio from Phase 00 through Phase 14 continuously without stopping for routine human confirmation.

Read:
- `MODEL_ROUTING.md`
- `USAGE_GUARD.md`

Both are mandatory operating policies.

## Required Autonomous Behavior
When a question or ambiguity appears:
1. read the project docs
2. inspect the existing repository and server
3. inspect official upstream documentation when current behavior matters
4. choose the simplest reversible implementation consistent with the architecture
5. route work to the cheapest model strong enough for the task
6. obey the usage thresholds in `USAGE_GUARD.md`
7. document material decisions
8. implement
9. test
10. fix failures
11. continue

## Continuous Phase Execution
Execute Phase 00 → Phase 01 → ... → Phase 14 in sequence.

At the end of every intermediate phase:
- run acceptance checks
- fix failures
- update phase status and execution records
- create a Studio-scoped commit when appropriate
- immediately begin the next phase in the same run

An intermediate phase completion is an internal checkpoint, NOT a stopping point.

### Explicit No-Stop Rule
Before Phase 14 is complete, Codex MUST NOT stop merely because a phase completed, tests passed, a commit was created, or an execution record was written.

Exception: the mandatory 95% usage stop-and-handoff policy in `USAGE_GUARD.md` overrides this rule.

## Delegation Strategy
Default coordinator: **Sol Medium**.

Delegate according to `MODEL_ROUTING.md`:
- Luna Low/Medium for cheap mechanical tasks
- Terra Medium for normal implementation
- Terra High for difficult implementation/debugging
- Sol Low/Medium for architecture-sensitive work and review
- Astra only for exceptional escalation

When spawning a child, explicitly set both model and reasoning effort. Do not rely on inherited defaults.

## Recovery from Interrupted Session
When a prior session ended because usage was exhausted:
1. do not restart completed work
2. inspect git status and git diff
3. inspect current execution records
4. inspect running/background processes and logs
5. reconstruct the interrupted task from repository/runtime state
6. continue from that state
7. finish, test, verify, document
8. continue the autonomous phase plan

For the current interrupted Windmill/worker runtime work, Terra High is the preferred recovery model.

## True Human Blockers
Only stop when an action literally cannot be completed from the available machine/session, or when `USAGE_GUARD.md` requires a resource-safety handoff.

Record true human blockers in `docs/HUMAN_BLOCKERS.md` and continue all independent work whenever usage permits.

## Provider Credential Rule
Never hardcode provider credentials. Build Settings → Integrations with secure server-side secret handling.

## Completion
The autonomous run is complete only when:
- Phases 00–14 are implemented or only true external blockers remain
- production deployment is attempted
- automated tests pass
- visual QA is performed
- health checks pass
- existing Hungree Goat services remain healthy
- remaining human-only items are consolidated
- one final build report is written
