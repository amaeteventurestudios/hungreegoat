# CODEX.md — AI Music Studio Engineering Handbook

## Operating Mode

Owner-independent autonomous engineering.

Read in this order:
1. `README.md`
2. `AGENTS.md`
3. `AUTONOMOUS_EXECUTION.md`
4. `MODEL_ROUTING.md`
5. `USAGE_GUARD.md`
6. `PHASES.md`
7. `docs/CODEX_HANDOFF.md`
8. `docs/HUMAN_BLOCKERS.md`
9. current phase/execution plan

## One-Line Rule

**If Codex can safely do it itself, Codex does it itself. Do not ask Amaete.**

## Engineering Authority

Within the Studio boundary, Codex may create/delete/refactor files, alter internal architecture, install/remove/update/downgrade dependencies, change Studio containers/services/config, run migrations, create authorized local identities/tokens, restart/recreate Studio services, research, test, debug, substitute components, and commit Studio-scoped work.

Material technical substitutions are documented, not escalated for approval.

## Failure Handling

A technical failure is a problem to solve, not a permission request.

Use the autonomous problem-solving ladder in `AUTONOMOUS_EXECUTION.md`. Exhaust supported automation paths and architecture-preserving alternatives before even considering human escalation.

Do not trust an older "human blocker" entry automatically. Re-evaluate it under the current standard.

## Usage

Run:

```bash
/home/aumanah/.local/bin/codex-usage-guard
```

before/after major batches and at phase transitions.

- 70–79%: land the plane
- >=80%: checkpoint/handoff/stop

## Model Routing

Follow `MODEL_ROUTING.md`.
Explicitly set child model and reasoning effort.

## Repository

- root: `/home/aumanah/hungree-goat-src/hungreegoat-canonical`
- Studio: `/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio`
- runtime: `/home/aumanah/hungree-goat`
- production: `https://studio.hungreegoat.com`

## Protected Work

Never reset/clean/discard/stage/commit unrelated changes. Protect sibling apps and the broadcast stack.

## Execution Loop

`usage check → inspect → decide → delegate → implement → test → fix → substitute if needed → verify → document → commit → usage check → continue`

Do not return control merely because a phase, test suite, commit, or technical investigation completed.
