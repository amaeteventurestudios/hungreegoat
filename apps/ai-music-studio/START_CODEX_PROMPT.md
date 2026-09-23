# Autonomous Build Prompt for Codex

You are the principal engineer responsible for building Hungree Goat AI Music Studio from beginning to production.

Repository:
`/home/aumanah/hungree-goat-src/hungreegoat-canonical`

Studio:
`/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio`

Runtime:
`/home/aumanah/hungree-goat`

Production:
`https://studio.hungreegoat.com`

## Mandatory Reading
Read all Studio root Markdown documents, especially:
1. AGENTS.md
2. AUTONOMOUS_EXECUTION.md
3. CODEX.md
4. MONOREPO_LAYOUT.md
5. ARCHITECTURE.md
6. PRODUCT_SPEC.md
7. PHASES.md
8. UI_SYSTEM.md
9. ORCHESTRATION_KERNEL.md
10. DATA_MODEL.md
11. API_CONTRACTS.md
12. AUDIO_PIPELINE.md
13. PROVIDER_ABSTRACTIONS.md
14. SECURITY.md
15. TESTING_QA.md
16. DEPLOYMENT.md
17. OPERATIONS.md
18. LICENSING.md
19. DEFINITION_OF_DONE.md
20. all phase documents under docs/phases/

## Mission
Execute Phase 00 through Phase 12 continuously, in order, without asking the owner for routine decisions or approvals.

You have authority to:
- inspect the server/repository
- research official documentation
- choose implementation details consistent with project architecture
- install required project dependencies/open-source software
- create files
- create migrations
- build Docker services
- configure Studio Caddy routing
- run tests
- run browser/E2E/visual verification
- fix failures
- retry
- update docs
- make Studio-scoped commits
- proceed from one phase to the next automatically

## Do Not Interrupt the Owner For
- normal technical decisions
- package/library selection covered by the architecture
- UI implementation details covered by the design docs
- permission to run tests
- permission to fix failures
- permission to install required Studio dependencies
- permission to create migrations
- permission to proceed to another phase
- manual verification Codex can perform itself
- routine provider/model abstractions
- ordinary configuration choices

If uncertain, research, make the simplest reversible choice, document it, and proceed.

## Human-Only Blockers
Only a true external human action may remain unresolved: payment, account creation, MFA, CAPTCHA, email verification, terms acceptance, unavailable API credential, inaccessible DNS/registrar control, missing private reference asset, or a dangerous destructive action outside Studio scope.

Record such items in `docs/HUMAN_BLOCKERS.md`. Continue all independent work. Do not repeatedly interrupt the owner.

## Provider Configuration
Implement a secure Settings → Integrations dashboard early.

Support:
- ElevenLabs
- OpenAI
- OpenRouter
- Anthropic/Claude
- future providers

Never hardcode credentials. The user must be able to replace keys and switch defaults without code changes.

## Visual UI
Use shadcn/ui + React + Next.js + TypeScript. If UI reference images exist, match them. If not, continue with the written design system; do not wait for images.

## Protected Existing Apps
Do not modify:
- apps/control/
- apps/player/
- apps/dj-studio/

unless a necessary, documented integration requires it.

Never reset/clean/discard unrelated existing changes.

## End State
Do not stop after Phase 00. Do not return a prompt for the next phase. Continue until Phase 12 is complete or only true external human blockers remain.

At the very end produce one consolidated report containing:
- completed phases
- architecture delivered
- services installed
- tests/checks performed
- production status
- provider integrations
- remaining human blockers
- security/backup status
- exact URLs and service health
