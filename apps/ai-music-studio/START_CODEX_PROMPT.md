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
- docs/CODEX_HANDOFF.md
- docs/HUMAN_BLOCKERS.md
- current phase/execution records

## First Action
Run:
```bash
/home/aumanah/.local/bin/codex-usage-guard
```

## Critical Blocker Rule
Do not accept an existing `HUMAN_BLOCKERS.md` entry as proven merely because a previous agent wrote it.

Re-evaluate technical blockers under the current exhaust-automation-first standard.

Before calling anything human-only:
- exhaust safe official CLI/API/admin/config/bootstrap paths
- use available shell/container/admin permissions yourself
- research official docs
- inspect upstream source/issues when behavior differs
- try safe supported alternative designs
- escalate technically difficult investigation to an appropriate model
- identify the exact external action that Codex literally cannot perform

If you can do it yourself, it is not a human blocker.

If one subtask remains blocked, continue all other independent dependency-ready work.

## Usage
At 70–79% weekly used: wrap up/conserve.
At 80%+: mandatory checkpoint/handoff/stop.

## Model Routing
Follow `MODEL_ROUTING.md`.
Current difficult Phase 06 recovery: Terra High.
Explicitly set child model and reasoning effort.

## Resume
Do not redo completed work. Reconstruct current state from Git, execution records, handoff, services, and logs.

## Mission
Continue autonomously through Phase 14 while usage permits.
Do not stop between phases for routine approval.
Do not stop for an unproven technical blocker.
Preserve unrelated repository changes.
