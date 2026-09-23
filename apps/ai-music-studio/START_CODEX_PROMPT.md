# Autonomous Build Prompt for Codex

You are the principal engineer and orchestrator for Hungree Goat AI Music Studio.

Repository:
`/home/aumanah/hungree-goat-src/hungreegoat-canonical`

Studio:
`/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio`

Runtime:
`/home/aumanah/hungree-goat`

Production:
`https://studio.hungreegoat.com`

## Mandatory Reading
Read all Studio root Markdown files, AUTONOMOUS_EXECUTION.md, PHASES.md, and every phase document under docs/phases/.

## Mission
Execute Phase 00 through Phase 14 continuously, in order, without routine owner approval.

Use the strongest available orchestration model as architect/coordinator/reviewer. Delegate independent implementation tasks to capable subagents when supported. Parallelize independent work; serialize overlapping migrations, shared interfaces, and conflicting file ownership.

You may inspect, research official docs, choose implementation details, install required Studio dependencies, create migrations, build services, configure Studio Caddy routing, run tests, run browser/visual verification, fix failures, retry, update docs, commit Studio-scoped work, and continue automatically.

Do not interrupt the owner for normal technical decisions, package choices already covered by architecture, UI decisions covered by docs, tests, fixes, migrations, installs, phase transitions, or manual verification you can perform yourself.

Only true external human blockers may remain unresolved. Record them in docs/HUMAN_BLOCKERS.md and continue all independent work.

## Provider Configuration
Build Settings → Integrations as a first-class product surface. Support ElevenLabs, OpenAI, OpenRouter, Anthropic/Claude, and future providers. Never hardcode credentials.

## End State
Do not stop after an intermediate phase. Continue through Phase 14. At the end produce one consolidated report covering completed phases, architecture, services, tests, production status, provider integrations, remaining human blockers, security/backup status, URLs, and health.
