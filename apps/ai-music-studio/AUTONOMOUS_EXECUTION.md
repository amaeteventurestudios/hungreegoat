# Autonomous Execution Contract

## Primary Directive
Codex is authorized to build Hungree Goat AI Music Studio from Phase 00 through Phase 12 continuously without stopping for routine human confirmation.

Do not ask the owner to:
- choose ordinary implementation details
- approve package installation
- approve dependency selection already covered by project docs
- approve normal file creation
- approve migrations
- approve UI implementation choices that follow the design system
- approve tests
- approve retries
- approve refactors inside the Studio boundary
- approve Docker service creation
- approve Caddy configuration for the Studio hostname
- approve local open-source engine installation
- approve documentation updates
- provide routine debugging direction
- manually verify something Codex can verify itself

## Required Autonomous Behavior
When a question or ambiguity appears:
1. read the project docs
2. inspect the existing repository and server
3. inspect official upstream documentation when current behavior matters
4. choose the simplest reversible implementation consistent with the architecture
5. document the decision in the execution plan or DECISIONS.md when material
6. implement it
7. test it
8. fix failures
9. continue

Do not stop merely because there are several reasonable choices.

## Continuous Phase Execution
Execute Phase 00 → Phase 01 → ... → Phase 12 in sequence.

At the end of each phase:
- run its acceptance checks
- fix failures
- update phase status
- create a Studio-scoped commit when appropriate
- continue immediately to the next phase

Do not wait for a new prompt between phases.

## Research Authority
Codex may independently consult official documentation and upstream repositories for:
- Next.js
- React
- shadcn/ui
- Base UI
- Tailwind
- FastAPI
- PostgreSQL
- SQLAlchemy/Alembic
- Windmill
- ElevenLabs
- OpenAI
- OpenRouter
- Anthropic
- FFmpeg
- librosa
- SoundFile
- Rubber Band
- Demucs
- Matchering
- Caddy
- Docker Compose
- Uptime Kuma

Prefer primary/official documentation. Pin or record important versions.

## Installation Authority
Codex may install project dependencies and required open-source software needed by the Studio, provided it:
- does not disrupt existing Hungree Goat production services
- does not remove unrelated packages
- uses isolated containers/environments where practical
- documents significant system-level changes
- verifies services after installation

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
3. use a mock/test adapter only when the architecture explicitly permits it
4. leave the system ready for the credential/action to be inserted later
5. collect all remaining human-only items into one final handoff instead of interrupting repeatedly

## Provider Credential Rule
Never hardcode provider credentials.

The Studio must provide a Settings → Integrations UI and secure server-side secret storage/reference layer for:
- ElevenLabs
- OpenAI
- OpenRouter
- Anthropic/Claude
- future providers

The UI must support:
- connected/not connected
- masked key
- replace/update
- enable/disable
- test connection
- selected/default model where applicable
- provider health
- last successful health check

Raw secrets must never be returned to the browser after storage.

## Visual Reference Rule
If approved UI reference images exist under the Studio docs/assets tree, treat them as visual ground truth.

If references are absent, continue using `UI_SYSTEM.md` and `PRODUCT_SPEC.md`. Do not stop waiting for screenshots.

When references arrive later, perform a visual alignment refinement pass without discarding working architecture.

## Completion
The autonomous run is complete only when:
- Phases 00–12 are implemented or a true external blocker prevents a provider-specific final step
- production deployment is attempted
- automated tests pass
- visual QA is performed
- health checks pass
- existing Hungree Goat services remain healthy
- remaining human-only items are consolidated in `docs/HUMAN_BLOCKERS.md`
- a final build report is written
