# USAGE_GUARD.md — Mandatory Codex Allowance Guard

## Installed Monitor

Verified on the Beelink:

- tool: `codex-limit-watch 0.2.0`
- license: MIT
- install: `/home/aumanah/.local/share/codex-limit-watch`
- raw JSON: `/home/aumanah/.local/bin/codex-usage --json`
- normalized guard: `/home/aumanah/.local/bin/codex-usage-guard`
- live terminal watcher: `/home/aumanah/.local/bin/codex-usage-watch`

The normalized guard is read-only, non-interactive, and verified against Codex `account/rateLimits/read`.

The account currently exposes the weekly window. Five-hour fields may be `null`; if they appear later, evaluate them too.

## Mandatory Checks

Run the guard:
- at session start
- before every major work batch
- after every meaningful work batch
- before phase transitions
- before expensive delegation
- after long research/debug loops

Print a visible line in the same Codex terminal:

`[USAGE] Weekly: X% used / Y% remaining | Guard: CONTINUE|WRAP-UP|STOP`

If five-hour usage is available, include it.

## Thresholds

### <70% weekly used — CONTINUE
Normal autonomous execution.

### 70–79% — WRAP-UP
Land the plane:
- start no large new phase/workstream
- avoid Astra
- minimize Sol
- prefer Luna/Terra
- finish current coherent task
- run essential tests
- commit coherent Studio work
- continuously update `docs/CODEX_HANDOFF.md`
- check usage more frequently

### >=80% — HARD STOP
- start no new implementation
- start no new phase
- spawn no new workers
- finish only the minimum safe in-flight operation
- run essential verification
- commit safe coherent Studio work
- fully update handoff
- preserve unrelated changes
- print final usage
- stop cleanly

This rule overrides every continuous-execution instruction.

## Guard Failure

If the normalized guard fails or cannot report weekly usage:
- do not start a large new batch
- checkpoint coherent work
- record the monitoring problem
- stop safely rather than risk exhausting allowance

## Five-Hour Window

When available, obey the more conservative result between weekly and five-hour limits.

Never invent unavailable values.

## Owner Visibility

The agent must print usage checks into its own terminal stream. The optional separate watcher is:

```bash
/home/aumanah/.local/bin/codex-usage-watch
```
