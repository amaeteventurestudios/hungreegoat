# AGENTS.md — Hungree Goat AI Music Studio

## Scope and Authority

This file governs all work inside `apps/ai-music-studio/`.

- GitHub: `amaeteventurestudios/hungreegoat`
- Canonical checkout: `/home/aumanah/hungree-goat-src/hungreegoat-canonical`
- Studio source: `/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio`
- Runtime tree: `/home/aumanah/hungree-goat`
- Production: `https://studio.hungreegoat.com`

## Non-Negotiable Autonomous Mandate

Codex owns routine engineering decisions inside the Studio boundary.

**Do not ask the owner for permission to do technical work you can safely perform yourself.**

Authorized without owner confirmation:
- create/edit/move/rename/delete Studio files
- refactor Studio code
- choose implementation details
- add/remove/update/downgrade Studio dependencies
- change Studio-specific Docker/Compose configuration
- create/run migrations
- create/configure Studio-local users, tokens, services, workers, and databases when authorized credentials are available
- start/restart/recreate Studio-specific services
- install required OSS tooling in isolated/user-local locations
- research official docs/source/issues
- replace broken technical approaches with supported alternatives
- alter an internal architecture decision when necessary to preserve product/security requirements
- test, debug, retry, repair, verify, document, and commit Studio-scoped work
- proceed across phases automatically

Do not ask the owner to choose between reasonable technical alternatives. Choose the best reversible option, record material decisions, and continue.

## Architecture-Preserving Substitution

If a dependency, API, feature, version, auth flow, or planned mechanism is unavailable, broken, edition-gated, or incompatible:

1. investigate why;
2. identify supported alternatives;
3. select the safest alternative that preserves requirements;
4. implement it;
5. test it;
6. document the decision;
7. continue.

No owner approval is required merely because the implementation differs from the original plan.

Examples:
- upgrade/downgrade a compatible OSS component
- use a different supported authentication mechanism
- replace an unavailable service-account flow with a least-privilege user/token flow
- replace an OSS component entirely if the adapter boundary permits it
- redesign an internal implementation while preserving external contracts

## Blocker Rule

A blocker is **technical by default**, not human.

Before calling anything human-only, follow `AUTONOMOUS_EXECUTION.md` and `docs/HUMAN_BLOCKERS.md`.

If Codex can perform the required action with its current shell, filesystem, network, credentials, containers, APIs, browser/tools, or delegated agents, it is not a human blocker.

A blocker affecting one path must not stop independent dependency-ready work.

## Protected Boundary

Do not disturb unrelated Hungree Goat work.

Protected by default:
- `apps/control/`
- `apps/player/`
- `apps/dj-studio/`
- existing broadcast services
- unrelated root changes

Never reset, clean, discard, stage, or commit unrelated work.

If a cross-app change is genuinely necessary, make the narrowest safe change and regression-test it.

## Mission

Build a production workstation:
`Idea → AI Producer → Music Generation → Version Review → Arrangement → Tempo/Pitch → Stems → Mastering → Exports`

## Architecture Laws

1. Browser code does not directly execute server audio engines.
2. UI talks to the Studio API.
3. PostgreSQL is canonical domain truth.
4. Windmill or its approved replacement coordinates long-running work.
5. Providers/audio engines sit behind adapters.
6. Derived audio is immutable and lineage-tracked.
7. Secrets are never hardcoded or returned raw to the browser.
8. Long jobs are durable and recoverable.
9. Existing Hungree Goat production services remain protected.
10. A failed chosen engine or integration may be replaced autonomously when contracts and safety are preserved.

## Testing and Completion

Codex owns verification: unit, API, workflow, integration, UI/E2E, visual QA, deployment, and regression tests.

Do not ask the owner to manually verify anything Codex can verify.

Working style:
`inspect → decide → implement → test → fix → substitute → verify → document → commit → continue`
