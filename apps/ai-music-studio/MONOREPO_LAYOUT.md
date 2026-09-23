# Monorepo Layout and Boundaries

## Canonical Source
- GitHub: `amaeteventurestudios/hungreegoat`
- Canonical checkout: `/home/aumanah/hungree-goat-src/hungreegoat-canonical`
- Studio source: `/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio`
- Runtime tree: `/home/aumanah/hungree-goat`
- Production URL: `https://studio.hungreegoat.com`

## Existing Hungree Goat Apps
- `apps/control/`
- `apps/dj-studio/`
- `apps/player/`

AI Music Studio is:
- `apps/ai-music-studio/`

## Source vs Runtime
The canonical checkout is where Codex edits and Git tracks source.

The runtime tree is deployment state. Do not treat `/home/aumanah/hungree-goat` as the canonical authoring workspace.

Deployment must be explicit and reproducible from canonical source to runtime.

## Git Boundary
There is one Git repository for these applications.

Do not:
- run `git init` inside the Studio
- add a nested `.git`
- create a separate Studio repo unless the owner explicitly changes this architecture later

## Protected Sibling Apps
Default no-touch:
- `apps/control/`
- `apps/player/`
- `apps/dj-studio/`

A Studio task may change them only if the integration genuinely requires it, the execution plan names exact files, existing behavior is preserved, relevant tests run, and the final summary calls out the impact.

## Preferred Working Directory
For Studio-focused Codex sessions:

```bash
cd /home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio
```

Git operations still resolve to the parent repository.

## Staging Rule
Always inspect `git status --short` before staging. Stage only Studio paths unless the task explicitly includes cross-app work. Never reset or discard unrelated modified/untracked files.
