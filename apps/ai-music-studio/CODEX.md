# CODEX.md — AI Music Studio Engineering Handbook

## Operating Mode
Autonomous end-to-end build with enforced model routing, usage protection, and an exhaust-automation-first blocker policy.

Read first:
1. `AUTONOMOUS_EXECUTION.md`
2. `MODEL_ROUTING.md`
3. `USAGE_GUARD.md`
4. `PHASES.md`
5. current phase/execution records

## Mandatory Usage Command
Before major batches and phase transitions:
```bash
/home/aumanah/.local/bin/codex-usage-guard
```

At 80% weekly used or greater: checkpoint and stop.

## Blocker Discipline
A technical failure is not automatically a human blocker.

Before marking a human blocker:
- exhaust supported CLI/API/admin/configuration paths available to the session
- research official upstream documentation
- inspect upstream source/issues when observed behavior contradicts docs
- test safe alternative supported designs
- use available shell/container/admin access yourself
- escalate model capability when appropriate
- document concrete evidence

Only escalate when there is a specific external action that Codex literally cannot perform.

Never stop the overall build for a blocker that does not prevent other independent dependency-ready work.

## Model Policy
- Sol Medium: coordinator/reviewer
- Terra High: difficult implementation/debugging
- Terra Medium: normal implementation
- Luna Low/Medium: scans and mechanical work
- Sol Low/Medium: selective architecture-sensitive escalation
- Astra: exceptional use only

Set child model + reasoning effort explicitly.

## Repository Context
- Git root: `/home/aumanah/hungree-goat-src/hungreegoat-canonical`
- Studio root: `/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio`
- Runtime tree: `/home/aumanah/hungree-goat`
- Production: `https://studio.hungreegoat.com`

## Execution Discipline
For each batch:
1. check usage
2. inspect state
3. investigate failures autonomously
4. delegate appropriately
5. implement
6. test/fix
7. verify
8. document
9. commit coherent Studio-scoped work when appropriate
10. check usage again
11. continue if permitted

Never reset/clean/stage unrelated repository work.
