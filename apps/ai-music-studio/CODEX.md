# CODEX.md — AI Music Studio Engineering Handbook

## Operating Mode
Autonomous end-to-end build with enforced model routing and usage protection.

Read first:
1. `AUTONOMOUS_EXECUTION.md`
2. `MODEL_ROUTING.md`
3. `USAGE_GUARD.md`
4. `PHASES.md`
5. current phase/execution records

## Mandatory Usage Command
Before any major batch or phase transition:

```bash
/home/aumanah/.local/bin/codex-usage-guard
```

Re-check after meaningful batches.

At 80% weekly used or greater: checkpoint and stop. Do not continue toward 95% or 100%.

Owner live display:

```bash
/home/aumanah/.local/bin/codex-usage-watch
```

## Model Policy
- Sol Medium: coordinator/reviewer
- Terra High: difficult implementation/debugging and current Phase 06 recovery
- Terra Medium: normal implementation
- Luna Low/Medium: scans, repetitive/mechanical work
- Sol Low/Medium: selective architecture-sensitive escalation
- Astra: exceptional use only

Set child model + reasoning effort explicitly.

## Repository Context
- Git root: `/home/aumanah/hungree-goat-src/hungreegoat-canonical`
- Studio root: `/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio`
- Runtime tree: `/home/aumanah/hungree-goat`
- Production: `https://studio.hungreegoat.com`

## Current Recovery State
Phase 06 Windmill/worker runtime work was interrupted by usage exhaustion. Resume from the current repository state and `docs/CODEX_HANDOFF.md`; do not redo completed phases.

## Execution Discipline
For each batch:
1. check usage
2. inspect state
3. delegate appropriately
4. implement
5. test/fix
6. verify
7. document
8. commit coherent Studio-scoped work when appropriate
9. check usage again
10. continue only when guard permits

Never reset/clean/stage unrelated repository work.
