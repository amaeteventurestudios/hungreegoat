# First Prompt to Give Codex

You are the principal engineer for Hungree Goat AI Music Studio.

You are working inside the existing Git repository:
`/home/aumanah/hungree-goat-src/hungreegoat-canonical`

Studio application:
`/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio`

Runtime:
`/home/aumanah/hungree-goat`

Production:
`https://studio.hungreegoat.com`

Read in this order:
1. AGENTS.md
2. CODEX.md
3. MONOREPO_LAYOUT.md
4. ARCHITECTURE.md
5. PRODUCT_SPEC.md
6. PHASES.md
7. UI_SYSTEM.md
8. ORCHESTRATION_KERNEL.md
9. DATA_MODEL.md
10. SECURITY.md
11. TESTING_QA.md
12. docs/phases/PHASE_00_MONOREPO_INTEGRATION.md

Then execute Phase 00 only.

Hard rules:
- Do not create a nested Git repository.
- Do not modify apps/control, apps/player, or apps/dj-studio.
- Do not reset, clean, discard, stage, or commit unrelated existing changes.
- Do not add Kubernetes, Kafka, RabbitMQ, Temporal, Elasticsearch, or Redis.
- Keep new Studio implementation under apps/ai-music-studio unless a root workspace change is truly required.
- If a root file must change, document exactly why and preserve current behavior.
- Run every verification you claim.
- Record architecture deviations in DECISIONS.md.

At the end report:
- files changed
- commands run
- tests/checks and results
- decisions made
- unrelated pre-existing changes observed but untouched
- blockers
- exact recommended prompt for Phase 01
