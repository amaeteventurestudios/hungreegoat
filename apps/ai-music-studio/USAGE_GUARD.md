# USAGE_GUARD.md — Codex Usage Protection and Handoff

## Purpose
Prevent an autonomous run from exhausting the weekly Work/Codex allowance.

This guard is now backed by a verified machine-readable monitor on the Beelink.

## Installed Monitor

Tool:
- `codex-limit-watch 0.2.0`
- license: MIT
- installed at: `/home/aumanah/.local/share/codex-limit-watch`

Commands:
- raw JSON: `/home/aumanah/.local/bin/codex-usage --json`
- normalized guard: `/home/aumanah/.local/bin/codex-usage-guard`
- live owner display: `/home/aumanah/.local/bin/codex-usage-watch`

The normalized guard is read-only, non-interactive, safe for repeated execution, and has been verified against Codex `account/rateLimits/read`.

Current environment note: this account currently exposes the weekly 10,080-minute window but not the 5-hour window. Missing 5-hour fields are returned as `null`. If Codex exposes the 5-hour window later, the wrapper will evaluate it automatically.

## Mandatory Agent Check

Before starting any major work batch, run:

```bash
/home/aumanah/.local/bin/codex-usage-guard
```

Run it again:
- after each meaningful work batch
- before starting a new phase
- before spawning a costly worker
- after a long debugging/research loop
- whenever usage state may have materially changed

The result is authoritative for autonomous routing/stop decisions.

## Weekly Hard Stop Policy

The owner requires a large reserve. Therefore:

### Below 70% used
- continue normally
- follow `MODEL_ROUTING.md`

### 70% through 79% used
Enter conservation mode:
- no Astra
- avoid unnecessary Sol
- prefer Luna/Terra
- keep child context narrow
- finish current coherent task
- update execution records and handoff continuously

### 80% used or greater
**MANDATORY STOP-AND-HANDOFF.**

At 80% weekly used:
- DO NOT start new implementation
- DO NOT start another phase
- DO NOT launch expensive exploratory work
- finish only the smallest safe in-flight operation required to leave the repo coherent
- run essential verification only
- commit verified Studio-scoped work when safe
- preserve unrelated changes
- fully update `docs/CODEX_HANDOFF.md`
- include current phase/task, completed work, uncommitted work, tests, failures, processes, logs, blockers, exact resume commands, and recommended next model
- stop cleanly with approximately 20% weekly allowance reserved

This 80% hard stop overrides every instruction to continue automatically through phases.

## Five-Hour Window

When the 5-hour window is available, obey the normalized guard's most conservative action.

If weekly usage would permit work but the 5-hour window requires checkpoint/stop, obey the 5-hour result.

If the 5-hour fields are `null`, do not invent values.

## Guard Output

Agents must parse the normalized JSON and respect its `action` field.

If this document's 80% owner policy is stricter than an older installed wrapper threshold, apply the stricter rule manually from `weekly_used_percent` until the wrapper is updated to match.

## Live Owner View

The owner can monitor usage in another terminal or tmux pane with:

```bash
/home/aumanah/.local/bin/codex-usage-watch
```

Default refresh interval: 30 seconds.
Ctrl-C exits cleanly.

## Handoff File

Use:
`apps/ai-music-studio/docs/CODEX_HANDOFF.md`

Keep it sufficiently current that a fresh Codex session can recover without hidden chat context.

## Failure Rule

If `codex-usage-guard` fails, returns malformed output, or cannot obtain weekly usage:
- do not begin a new large work batch
- checkpoint current coherent work
- record the monitoring failure
- stop safely rather than risk exhausting the allowance
