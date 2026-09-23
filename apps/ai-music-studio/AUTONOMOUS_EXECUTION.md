# Autonomous Execution Contract

## Primary Directive
Codex is authorized to build Hungree Goat AI Music Studio from Phase 00 through Phase 14 continuously without stopping for routine human confirmation.

Do not ask the owner to approve ordinary implementation details, package installation, dependency selection already covered by project docs, file creation, migrations, UI decisions covered by the design system, tests, retries, refactors inside the Studio boundary, Docker services, Studio Caddy configuration, local open-source engine installation, documentation updates, or routine debugging.

## Required Autonomous Behavior
When a question or ambiguity appears:
1. read the project docs
2. inspect the existing repository and server
3. inspect official upstream documentation when current behavior matters
4. choose the simplest reversible implementation consistent with the architecture
5. document material decisions
6. implement
7. test
8. fix failures
9. continue

Do not stop merely because several reasonable choices exist.

## Continuous Phase Execution
Execute Phase 00 → Phase 01 → ... → Phase 14 in sequence.

At the end of every intermediate phase:
- run acceptance checks
- fix failures
- update phase status and execution records
- create a Studio-scoped commit when appropriate
- IMMEDIATELY begin the next phase in the same run

An intermediate phase completion is an internal checkpoint, NOT a stopping point and NOT a reason to return control to the owner.

### Explicit No-Stop Rule
Before Phase 14 is complete, Codex MUST NOT:
- end the run merely because a phase completed
- emit a final-style "Phase XX is complete" response and wait
- ask for a next-phase prompt
- recommend an exact prompt for the next phase
- require owner confirmation to continue
- stop after writing a completion record
- stop because tests passed
- stop because a commit was created

Instead, record the checkpoint internally and continue immediately.

Only produce a user-facing consolidated completion report after Phase 14 is complete, or when a true human-only blocker prevents all remaining independent work.

## Delegation Strategy
Use the strongest available orchestration model as architect/coordinator/reviewer and delegate independent implementation tasks to capable subagents when supported.

The orchestrator owns:
- dependency ordering
- task decomposition
- context packaging
- guardrails
- conflict avoidance
- review
- integration
- phase acceptance
- final verification

Parallelize genuinely independent work. Serialize overlapping migrations, shared interfaces, and conflicting file ownership.

Delegated work does not reduce the orchestrator's responsibility to inspect actual diffs and verification evidence.

## Research Authority
Codex may independently consult official documentation and upstream repositories for the selected stack and providers. Prefer primary sources and record significant version-sensitive decisions.

## Installation Authority
Codex may install project dependencies and required open-source software provided it does not disrupt existing Hungree Goat production services, does not remove unrelated packages, uses isolated environments where practical, documents system-level changes, and verifies health afterward.

## Failure Recovery
If a command, test, migration, build, container, provider call, or deployment step fails:
- inspect the failure
- research it
- attempt a safe fix
- rerun verification
- continue

Do not escalate routine debugging to the owner.

## True Human Blockers
Only stop when the task requires an action that literally cannot be completed from the available machine/session, such as:
- an API key or credential that does not exist and cannot be created programmatically
- payment/subscription purchase
- MFA/2FA approval
- CAPTCHA
- email verification
- legal/terms acceptance
- provider account creation requiring interactive identity/payment
- DNS/registrar action when no authorized interface is available
- a missing private reference asset the owner specifically wants used
- a security-sensitive destructive action outside the Studio boundary that would endanger existing production data/services

When a true human blocker occurs:
1. record it in `docs/HUMAN_BLOCKERS.md`
2. continue every other independent task
3. use a mock/test adapter only when architecture permits
4. leave the system ready for the missing action
5. consolidate remaining human-only items into one final handoff

## Provider Credential Rule
Never hardcode provider credentials.

The Studio must provide Settings → Integrations with secure server-side secret handling for:
- ElevenLabs
- OpenAI
- OpenRouter
- Anthropic/Claude
- future providers

The UI must support:
- connected/not connected
- masked key
- replace/update/delete
- enable/disable
- test connection
- selected/default model where applicable
- provider health
- last successful health check
- quota/usage information where exposed

Raw secrets must never be returned to the browser after storage.

## Visual Reference Rule
If approved UI reference images exist under `docs/ui-references/`, treat them as visual ground truth.

If references are absent, continue using `UI_SYSTEM.md` and `PRODUCT_SPEC.md`. Do not stop waiting for screenshots.

## Completion
The autonomous run is complete only when:
- Phases 00–14 are implemented or only true external blockers remain
- production deployment is attempted
- automated tests pass
- visual QA is performed
- health checks pass
- existing Hungree Goat services remain healthy
- remaining human-only items are consolidated in `docs/HUMAN_BLOCKERS.md`
- one final consolidated build report is written
