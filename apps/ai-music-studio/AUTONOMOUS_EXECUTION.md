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

At 80% weekly usage or greater, stop new implementation, checkpoint, write the handoff, and stop cleanly.

## Required Autonomous Behavior
When a question, failure, or ambiguity appears:
1. check usage
2. read project docs
3. inspect repository/runtime state
4. consult official upstream docs when needed
5. investigate safe supported alternatives
6. choose the simplest reversible implementation
7. route work to the cheapest model strong enough
8. implement
9. test/fix/verify
10. document
11. re-check usage
12. continue if permitted

## Human-Blocker Standard — Exhaust Automation First

A failed implementation path is NOT a human blocker.

Codex MUST NOT classify a problem as human-only merely because:
- an API endpoint returns an error
- a preferred API/CLI path is unavailable
- an administrative action is required
- credentials or identities are involved
- the current implementation approach failed
- a feature is unavailable in one product tier
- documentation is ambiguous
- a service reports an unexpected limitation

Before declaring a human-only blocker, Codex must exhaust all safe, relevant, supported paths available from the current machine/session, including where applicable:
- official CLI commands
- official APIs
- authenticated admin APIs already available
- documented bootstrap/setup mechanisms
- supported local configuration
- container exec/admin commands
- service/database configuration that is supported and safe
- upstream official documentation
- upstream source code and issue tracker when behavior differs from docs
- alternative supported authentication/identity flows
- safe architecture-compatible workarounds
- delegation to a more capable model when the issue is technically difficult

If Codex has the shell access, credentials, permissions, or tooling needed to perform an action itself, that action is NOT a human-only blocker.

Examples that are NOT human blockers:
- "someone must run this CLI command" when Codex can run it
- "an admin must call this API" when Codex has authorized admin access
- "a container must be inspected/reconfigured" when Codex can safely do so
- "the first endpoint failed" before alternatives were investigated
- "service accounts are Enterprise-only" when a supported normal-user/token design can satisfy the requirement

## Human-Blocker Proof Requirement

A blocker may be labeled human-only only when Codex can identify the exact external human action that it literally cannot perform.

Before stopping, record:
1. the exact blocked requirement
2. every safe automation path attempted
3. commands/endpoints and relevant error summaries
4. official documentation/source evidence consulted
5. why remaining alternatives are unsafe, unsupported, or unavailable
6. the exact human action required
7. why Codex cannot perform that action itself
8. all independent work that was completed despite the blocker

Valid examples include:
- MFA/2FA approval on a device Codex cannot access
- CAPTCHA
- payment/purchase authorization
- legal/terms acceptance requiring the owner
- email verification unavailable to the session
- unavailable credential that cannot be programmatically obtained
- registrar/DNS action when no authorized interface exists
- destructive external action requiring explicit owner authorization

When a blocker affects only one subtask, record it and continue every other independent task. Do not stop the overall build unless all remaining dependency-ready work is blocked.

## Continuous Phase Execution
Execute Phase 00 → Phase 01 → ... → Phase 14 while usage remains below the hard-stop threshold.

Intermediate phase completion is an internal checkpoint, not a reason to ask for approval.

## Delegation Strategy
Default coordinator: Sol Medium.

Follow `MODEL_ROUTING.md`. Explicitly set child model and reasoning effort.

## Recovery
When resuming interrupted work:
- inspect `docs/CODEX_HANDOFF.md`
- inspect git status/diff
- inspect execution records
- inspect relevant processes/logs
- continue from disk/runtime state rather than restarting completed work

## Completion
The run ends only after Phase 14, the mandatory usage stop, or a PROVEN human-only blocker prevents every remaining independent dependency-ready task.
