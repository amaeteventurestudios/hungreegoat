# USAGE_GUARD.md — Codex Usage Protection and Handoff

## Purpose
Prevent an autonomous run from consuming the entire weekly Work/Codex allowance without leaving a resumable state.

## Important Runtime Limitation
Codex CLI exposes usage information to the user through `/status` and the Usage dashboard. If the agent/runtime itself exposes current allowance metadata, use it. If the agent cannot programmatically read the allowance, do not pretend that an automatic threshold can be enforced with certainty.

The guard therefore has two modes:
1. **Automatic** — when current usage/remaining allowance is exposed to the running agent.
2. **Best-effort checkpointing** — when it is not.

## Threshold Policy

### Below 80% used
- operate normally
- follow MODEL_ROUTING.md
- continue autonomous phases

### 80% used / 20% remaining
Enter **conservation mode**:
- no Astra
- avoid unnecessary Sol High/Medium work
- prefer Luna/Terra workers
- reduce repeated full-doc rereads
- use narrow context packages for children
- finish current coherent task before opening large new workstreams
- update current execution record

### 90% used / 10% remaining
Enter **handoff preparation mode**:
- do not begin a new large phase unless it can be completed cheaply
- delegate routine work to Luna/Terra
- commit verified Studio-scoped work
- update execution plan with exact current state
- record running processes, logs, failing tests, and next commands
- begin/update `docs/CODEX_HANDOFF.md`

### 95% used / 5% remaining
Enter **mandatory stop-and-handoff mode**:
- DO NOT start new implementation
- finish only the smallest safe in-flight operation necessary to leave the repo coherent
- stop expensive exploration/debugging
- run only essential verification
- commit verified Studio-scoped work when safe
- preserve unrelated changes
- write/update `docs/CODEX_HANDOFF.md`
- include current phase/task, completed work, uncommitted work, tests, failures, running services/processes, blockers, exact resume commands, and recommended next model
- then stop cleanly before allowance reaches zero

## If Usage Cannot Be Read Programmatically
At minimum:
- create durable execution records at every meaningful checkpoint
- commit coherent Studio-scoped work frequently
- keep `docs/CODEX_HANDOFF.md` continuously current once a long-running phase begins
- avoid depending on hidden conversation context for recovery
- when the user reports that usage is at or above a threshold, immediately apply the corresponding policy above

## Handoff File
Use:
`apps/ai-music-studio/docs/CODEX_HANDOFF.md`

It must contain:
- timestamp
- current model/effort
- current phase
- current task
- last good commit
- completed phases
- work in progress
- uncommitted files
- tests run/results
- active/background processes
- relevant logs
- architectural decisions
- human blockers
- protected unrelated files
- exact next commands
- exact recommended resume prompt
- recommended next model/effort

## Rule Priority
The 95% stop-and-handoff rule overrides the normal "do not stop between phases" rule. It is a resource-safety stop, not an owner-approval stop.
