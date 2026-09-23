# CODEX.md — AI Music Studio Engineering Handbook

## Operating Mode
This is an autonomous end-to-end build.

Read `AUTONOMOUS_EXECUTION.md`. Execute Phase 00 through Phase 14 continuously. There is no phase-by-phase owner approval loop.

Intermediate phase completion is internal state only. Do not return control to the owner merely because a phase completed. Do not ask for or recommend a next-phase prompt. Continue immediately until Phase 14 is complete or no independent work remains because of a true human-only blocker.

## Repository Context
- Git root: `/home/aumanah/hungree-goat-src/hungreegoat-canonical`
- Studio root: `/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio`
- Runtime tree: `/home/aumanah/hungree-goat`
- Production: `https://studio.hungreegoat.com`
- GitHub: `amaeteventurestudios/hungreegoat`

## Product Goal
Create a production workstation, not a chatbot.

The user can create a project/song, describe the goal, generate a production plan, generate multiple versions, compare and approve, edit arrangement, create tempo/pitch variants, separate stems, master, export, and return later to complete reproducible lineage.

## Principle
Build the orchestration layer, not the engines.

Do not reimplement music generation, stem separation, time stretching, transcoding, analysis, reference mastering, or generic UI primitives.

## Required Abstractions
- `AIProducerProvider`
- `MusicGenerationProvider`
- `AudioAnalyzer`
- `TempoProcessor`
- `StemSeparator`
- `MasteringProvider`
- `StorageProvider`
- `OrchestrationClient`
- `SecretStore`

## Provider Strategy
AI Producer providers:
- OpenAI
- OpenRouter
- Anthropic/Claude

Music generation:
- ElevenLabs initially

All must be configurable through Settings → Integrations. Do not require source-code edits to rotate keys or switch defaults.

## Secrets Dashboard
Build an integrations dashboard early, before provider-dependent functionality.

For each provider:
- connection state
- masked credential
- update/replace/delete credential
- enable/disable
- test connection
- model/default selection
- health status
- last successful test
- quota/usage information where available

Store secrets server-side. Never return raw stored secrets to the browser.

## Cross-App Rule
Do not refactor `apps/control`, `apps/player`, or `apps/dj-studio` merely because similar code exists. Cross-app changes require documented impact and regression testing.

## Execution Discipline
For each phase:
1. read docs and inspect existing state
2. create/update an execution plan
3. research current upstream docs when necessary
4. implement
5. run checks
6. fix failures autonomously
7. visually verify UI
8. update docs
9. commit Studio-scoped work when appropriate
10. mark the phase checkpoint internally
11. immediately start the next phase

Do not pause for owner confirmation.

## Decision Rule
When multiple technically sound choices exist, choose based on:
1. project docs
2. maintainability
3. reversibility
4. minimal coupling
5. mature open-source support
6. simplest operational model

Document material choices instead of asking.

## No Fake Completion
An integration is not complete because code compiles. Real completion requires configuration, verified invocation when credentials exist, normalized output, persistence, surfaced errors, retry behavior, synchronized UI state, and documented verification.

If credentials do not yet exist, finish the provider adapter, settings UI, secure secret path, health-check path, mocks/fixtures if appropriate, and every independent test. Record the credential as a human blocker and continue.

## Visual References
If visual reference images are present in `docs/ui-references/`, use them as visual ground truth. If they are absent, continue from `UI_SYSTEM.md` and `PRODUCT_SPEC.md`.

## Commit Discipline
Stage intentionally. Do not reset unrelated work. Prefer Studio-scoped commits.

## Success Definition
A user can open `https://studio.hungreegoat.com`, configure providers in the UI, create a project, generate and compare versions, transform tempo, separate stems, master, export, close the browser, return later, and recover the complete history.

The run ends only after Phase 14 and one consolidated final report.
