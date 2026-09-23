# Autonomous Execution Contract

## Primary Directive
Codex is authorized to build Hungree Goat AI Music Studio from Phase 00 through Phase 14 continuously without stopping for routine human confirmation.

Read `MODEL_ROUTING.md` and follow its model-routing policy.

## Required Autonomous Behavior
When a question or ambiguity appears:
1. read the project docs
2. inspect the existing repository and server
3. inspect official upstream documentation when current behavior matters
4. choose the simplest reversible implementation consistent with the architecture
5. route work to the cheapest model strong enough for the task
6. document material decisions
7. implement
8. test
9. fix failures
10. continue

## Continuous Phase Execution
Execute Phase 00 → Phase 01 → ... → Phase 14 in sequence.

At the end of every intermediate phase:
- run acceptance checks
- fix failures
- update phase status and execution records
- create a Studio-scoped commit when appropriate
- IMMEDIATELY begin the next phase in the same run

An intermediate phase completion is an internal checkpoint, NOT a stopping point.

### Explicit No-Stop Rule
Before Phase 14 is complete, Codex MUST NOT:
- end the run merely because a phase completed
- emit a final-style phase-complete response and wait
- ask for a next-phase prompt
- recommend a next-phase prompt
- require owner confirmation to continue
- stop after writing a completion record
- stop because tests passed
- stop because a commit was created

Only produce a consolidated completion report after Phase 14, or when a true human-only blocker prevents all remaining independent work.

## Delegation Strategy
Default coordinator: **Sol Medium**.

Delegate implementation according to `MODEL_ROUTING.md`:
- Luna Low/Medium for cheap mechanical tasks
- Terra Medium for normal implementation
- Terra High for difficult implementation/debugging
- Sol Low/Medium for architecture-sensitive work and review
- Astra only for exceptional escalation

When spawning a child, explicitly set both model and reasoning effort. Do not rely on inherited defaults.

The orchestrator owns:
- dependency ordering
- decomposition
- context packaging
- guardrails
- conflict avoidance
- review
- integration
- phase acceptance
- final verification

Parallelize independent work. Serialize overlapping migrations, shared interfaces, and conflicting file ownership.

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
Only stop when an action literally cannot be completed from the available machine/session, such as:
- unavailable credential
- payment/subscription purchase
- MFA/2FA
- CAPTCHA
- email verification
- legal/terms acceptance
- inaccessible DNS/registrar control
- missing private reference asset
- destructive action outside Studio scope that could endanger production

Record true blockers in `docs/HUMAN_BLOCKERS.md` and continue all independent work.

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
