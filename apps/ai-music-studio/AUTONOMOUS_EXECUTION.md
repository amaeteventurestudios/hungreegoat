# AUTONOMOUS_EXECUTION.md — Owner-Independent Engineering Contract

## Primary Directive

Build Hungree Goat AI Music Studio autonomously through Phase 14.

The owner does **not** want routine engineering questions.

Within the Studio boundary, Codex has standing authority to make and execute technical decisions. The default response to a technical obstacle is **solve it**, not **ask the owner**.

## Decision Rights

Without asking the owner, Codex may:
- create/delete/edit/refactor Studio source
- install/remove/update/downgrade dependencies
- modify Studio-specific runtime/container configuration
- create/run migrations and Studio data structures
- create/reconfigure/restart/recreate Studio-specific services
- create/configure authorized local users/tokens/identities
- research and test upstream-supported alternatives
- replace a broken component or integration behind an abstraction
- change implementation details and internal architecture
- choose models/workers according to `MODEL_ROUTING.md`
- run diagnostics/tests/builds/browser automation
- commit coherent Studio-scoped work
- continue to the next dependency-ready task or phase

No owner confirmation is required for those actions.

## Mandatory Usage Safety

Before major work batches, phase transitions, costly delegation, and after meaningful work batches, run:

```bash
/home/aumanah/.local/bin/codex-usage-guard
```

Print a short visible usage line when checked.

- <70% weekly used: continue normally
- 70–79%: wrap up/conserve
- >=80%: mandatory checkpoint + handoff + stop

The 80% usage stop overrides the continuous-execution rule.

## Autonomous Problem-Solving Ladder

When anything fails:

1. inspect the actual error/state;
2. reproduce if useful;
3. inspect logs/config/version/runtime;
4. consult official docs;
5. inspect upstream source/issues when docs and behavior disagree;
6. try supported CLI/API/admin/config/bootstrap paths available to the session;
7. use container/service/database tooling when safe;
8. test compatible version changes;
9. test alternate supported auth/configuration paths;
10. use existing provider/engine abstractions to substitute components when appropriate;
11. delegate difficult research/debugging to the appropriate model;
12. implement the safest architecture-preserving solution;
13. verify it;
14. document it;
15. continue.

Do not stop at step 1, 3, 5, or the first failed path.

## Architecture-Preserving Substitution Is Pre-Approved

A dependency/feature/path being broken, missing, edition-gated, unsupported, or incompatible does not create an approval gate.

Codex may autonomously:
- upgrade/downgrade compatible versions
- switch supported auth/identity flows
- change internal service configuration
- replace an engine/provider implementation behind an adapter
- redesign an internal workflow
- use a different mature OSS component when necessary

Conditions:
- preserve product behavior/contracts
- preserve or improve security
- preserve data integrity
- remain within the Studio boundary
- avoid new paid obligations unless already authorized
- document material changes in `DECISIONS.md`

## Human-Only Blocker — Very High Bar

A human-only blocker exists only when an external action is literally impossible for Codex to perform with available tools/permissions.

Valid examples:
- MFA/2FA on an inaccessible device
- CAPTCHA
- payment or purchase authorization
- legal/terms acceptance
- inaccessible email verification
- credential that does not exist and cannot be obtained programmatically
- external control plane with no authorized interface
- destructive action outside the Studio boundary that would materially risk unrelated production and cannot be safely isolated

Not human blockers:
- API 4xx/5xx
- unsupported endpoint
- broken documentation
- admin action Codex can perform
- CLI failure
- OSS edition limitation when alternatives exist
- service-account limitation
- version mismatch
- migration work
- package installation
- container recreation
- local credential/token/user creation when authorized
- architecture change
- need to research
- need to choose between technical options

## Proof Required Before Human Escalation

Before writing a human blocker, record:
1. exact blocked requirement;
2. evidence of the failure;
3. automation paths attempted;
4. docs/source/issues consulted;
5. alternatives considered;
6. why each remaining safe alternative is unavailable;
7. exact human action required;
8. why Codex cannot perform that action;
9. independent work that remains possible.

If independent work remains, continue it. Do not stop the overall run.

## Continuous Execution

Phase completion is an internal checkpoint.

At each checkpoint:
`test → fix → verify → document → commit → usage check → continue`

Do not:
- announce a phase completion and wait
- ask for a next-phase prompt
- ask whether to continue
- ask the owner to choose a technical solution
- stop because a planned mechanism changed

Proceed to the next dependency-ready task automatically.

## Recovery

On a fresh/resumed session:
- read `README.md` first
- read the instruction hierarchy
- read `docs/CODEX_HANDOFF.md`
- inspect git status/diff
- inspect execution records
- inspect services/processes/logs
- reconstruct state from disk/runtime
- continue without redoing completed work

## End Conditions

Stop only when:
1. Phase 14 is complete and final verification/reporting is done;
2. usage guard reaches its mandatory stop threshold; or
3. a **proven** human-only blocker prevents every remaining dependency-ready task.

Anything else: solve, substitute, verify, continue.
