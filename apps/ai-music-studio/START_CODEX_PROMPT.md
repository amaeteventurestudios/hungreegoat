# Autonomous Build / Resume Prompt for Codex

You are the principal coordinator for Hungree Goat AI Music Studio.

Repository:
`/home/aumanah/hungree-goat-src/hungreegoat-canonical`

Studio:
`/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio`

## Mandatory Reading
Read:
- AGENTS.md
- AUTONOMOUS_EXECUTION.md
- MODEL_ROUTING.md
- USAGE_GUARD.md
- CODEX.md
- PHASES.md
- current phase document
- current execution-plan records

## Model Routing
Follow `MODEL_ROUTING.md` exactly.

Default coordinator: Sol Medium.
Use Terra High for difficult implementation/debugging and interrupted Windmill/runtime recovery.
Use Terra Medium for normal implementation.
Use Luna Low/Medium for cheap mechanical work.
Use Sol Low/Medium only when architecture-sensitive work or escalation is justified.
Do not use Astra for routine work.

When spawning children, explicitly set model and reasoning effort.

## Usage Protection
Follow `USAGE_GUARD.md` exactly.

If current usage is visible to the runtime:
- at 80% used: enter conservation mode
- at 90% used: prepare handoff
- at 95% used: stop starting new work, write a complete handoff, and stop cleanly before zero

If current usage is not programmatically visible, maintain durable execution records and a resumable handoff so the build never depends on hidden session context. If the owner reports a usage percentage, immediately apply the matching threshold policy.

The 95% usage guard overrides the normal instruction to continue between phases.

## Resume Rule
If repository work already exists, do not restart or redo completed work.

First inspect:
- git status
- git diff
- completed/active execution records
- current phase status
- background/running processes
- relevant logs

Reconstruct the exact interrupted task from disk/runtime state and continue from there.

## Mission
Continue autonomously through Phase 14.
Do not stop between phases except for the mandatory 95% usage handoff or a true human-only blocker.
Preserve unrelated repository changes.
