# CODEX.md — AI Music Studio Engineering Handbook

## Purpose
This is the deeper engineering handbook for Codex. `AGENTS.md` is the persistent operating guide.

AI Music Studio is not a separate repository. It is a first-class app inside the Hungree Goat monorepo.

## Repository Context
- Git root: `/home/aumanah/hungree-goat-src/hungreegoat-canonical`
- Studio root: `/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio`
- Runtime tree: `/home/aumanah/hungree-goat`
- Production: `https://studio.hungreegoat.com`
- GitHub: `amaeteventurestudios/hungreegoat`

## Product Goal
Create a production workstation, not a chatbot.

The user should be able to:
1. create a project/song
2. describe the musical goal
3. generate a structured production plan
4. generate multiple versions
5. listen and compare
6. approve a version
7. edit arrangement metadata/sections
8. create tempo/pitch/remix variants
9. separate stems
10. master against a reference
11. export WAV/MP3/stems
12. return later and recover complete lineage

## Principle
Build the orchestration layer, not the engines.

Do not reimplement music generation, stem separation, time stretching, transcoding, analysis, reference mastering, or generic UI primitives.

## V1 Boundaries
V1 is private/self-hosted, project-based, versioned, durable, non-destructive, and provider-agnostic.

V1 is not a full DAW, social network, streaming platform, plugin host, licensing marketplace, native mobile app, or Kubernetes deployment.

## Required Abstractions
- `AIProducerProvider`
- `MusicGenerationProvider`
- `AudioAnalyzer`
- `TempoProcessor`
- `StemSeparator`
- `MasteringProvider`
- `StorageProvider`
- `OrchestrationClient`

## Studio Structure
Within `apps/ai-music-studio/`:

```text
AGENTS.md
CODEX.md
MONOREPO_LAYOUT.md
ARCHITECTURE.md
PRODUCT_SPEC.md
PHASES.md
UI_SYSTEM.md
ORCHESTRATION_KERNEL.md
DATA_MODEL.md
API_CONTRACTS.md
AUDIO_PIPELINE.md
PROVIDER_ABSTRACTIONS.md
SECURITY.md
TESTING_QA.md
DEPLOYMENT.md
OPERATIONS.md
LICENSING.md
DECISIONS.md
DEFINITION_OF_DONE.md
START_CODEX_PROMPT.md
apps/
  web/
  api/
packages/
  ui/
  contracts/
  config/
workers/
  audio/
  separation/
  mastering/
windmill/
  flows/
  scripts/
infra/
  caddy/
  docker/
docs/
  phases/
  exec-plans/
tests/
```

## Cross-App Rule
Do not refactor `apps/control`, `apps/player`, or `apps/dj-studio` merely because similar code exists there. Reuse only when there is a stable shared contract worth extracting or an explicit integration requires it.

Any cross-app change requires a `Cross-App Impact` section in the execution plan.

## Execution Discipline
For multi-file work:
1. read relevant docs
2. inspect the existing tree
3. write/update an execution plan
4. implement the smallest coherent slice
5. run tests
6. visually verify UI changes
7. update docs
8. summarize exactly what changed

## No Fake Completion
An integration is not complete because code compiles. Real completion requires working configuration, verified invocation, normalized output, persisted assets, surfaced errors, understood retry behavior, synchronized UI state, and documented verification.

## Mocks
Mocks are allowed before integration phases if they implement the real interface, are visibly identified, can be removed without a UI rewrite, and never masquerade as real provider output.

## Screen Map
1. Dashboard
2. New Project / New Song
3. AI Producer
4. Generation
5. Listen & Compare
6. Edit / Arrangement
7. Tempo / Remix
8. Stems & Mastering
9. Library / Final Masters
10. Settings / Integrations

## Commit Discipline
Because this is a shared monorepo:
- stage paths intentionally
- do not use destructive broad Git commands
- do not commit unrelated changes
- prefer Studio-scoped commits

Examples:
- `feat(studio): scaffold app shell`
- `feat(studio-api): add project domain`
- `feat(studio-orchestration): add generation flow`
- `feat(studio-audio): add tempo worker`
- `docs(studio): complete phase 04`

## Success Definition
A user can open `https://studio.hungreegoat.com`, create a project, generate and compare versions, transform tempo, separate stems, master a mix, export results, close the browser, return later, and find a complete reproducible project history.
