# Phase 00 — Monorepo Integration

## Objective
Make `apps/ai-music-studio` a well-defined application boundary inside the existing Hungree Goat monorepo.

## Work
- verify monorepo structure
- preserve sibling apps
- establish Studio-local workspace plan
- establish source/runtime distinction
- establish environment naming
- add implementation scaffolding only inside Studio unless a root workspace change is unavoidable
- validate no nested `.git`
- create execution-plan mechanism
- inspect existing root tooling before changing it

## No-Touch
Do not modify:
- `apps/control`
- `apps/player`
- `apps/dj-studio`

unless a root workspace requirement genuinely needs a compatibility adjustment and it is documented first.

## Acceptance
- Git top-level remains Hungree Goat root
- Studio files live under `apps/ai-music-studio`
- no nested repo
- docs accurately describe paths
- no unrelated changes staged
- Phase 01 can proceed cleanly
