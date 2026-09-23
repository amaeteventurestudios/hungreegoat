# Codex Handoff — 2026-09-23

## Current State

- Model / effort: Terra High.
- Usage: weekly 4% used / 96% remaining; guard `CONTINUE`; no five-hour value.
- Current phase: 06 — Orchestration Kernel.
- Last committed Studio checkpoint: `e0c0619 docs(studio): checkpoint autonomous session`.
- The repository entered this session with an unresolved Studio-document merge. Its conflicting policies were reconciled in the working tree: the newer owner-independent policy wins, while current Phase 06 evidence is retained. Do not reset or discard this Studio-scoped merge resolution.

## Completed

- Phases 00–05 are verified and committed.
- Phase 06 durable orchestration is committed in `ebd0b28`: migration `0005_orchestration`, attempts/outbox, dispatcher, internal worker routes, immutable events, retry/cancel/recovery behavior, fixed `system.verify` diagnostic, tagged worker package, and job activity UI.
- The pinned source-built Windmill image is `hg-studio-windmill:1.817.0-source`. The provisioner creates workspace `studio`, installs `f/studio/execute`, saves its hash, and removes the temporary bootstrap superadmin from runtime.
- Earlier checks passed: API 41 tests; worker 5 tests; web lint/typecheck/build; Compose config; import/compile checks; boundary check. Migration `0005_orchestration` is applied.

## Runtime

- `studio-api`, `studio-web`, `studio-postgres`, `studio-windmill-postgres`, and `studio-windmill` are running. The migration service exited successfully.
- `studio-worker` and `studio-dispatcher` are intentionally not started.
- Private orchestration files are outside Git at `/home/aumanah/.local/share/hg-studio/dev/orchestration`; `script-hash` is populated mode 0600 and `windmill-token` is empty mode 0600. Never print their values.

## Active Technical Issue

The pinned Windmill OSS v1.817.0 rejects ordinary-user creation through its documented CLI/UI endpoint with `User creation is not implemented in the open-source version.` The deployment contains only its seeded superadmin. The temporary bootstrap superadmin must never be used as the dispatcher credential; the inspected impersonation path omits the necessary workspace/scopes.

This is not a human blocker. Investigate and implement a least-privilege OSS-compatible identity route, a supported version/configuration alternative, or an orchestration substitution behind the existing client boundary. Do not start Phase 07 until the Phase 06 live gate is proven.

## Protected Unrelated Work

- Modified: `apps/control/hgc/dj_orchestrator.py`.
- Untracked root files: `docs/YOUTUBE_OAUTH_HANDOFF.md` and `docs/images/{for-businesses-reference-page.png,hungree-goat-business-og.webp,menu-bar.png}`.
- Never reset, clean, stage, or commit these paths.

## Resume

1. Run `/home/aumanah/.local/bin/codex-usage-guard` and print the normalized usage line.
2. Inspect `scripts/provision-orchestration.py`, `apps/api/src/studio_api/orchestration_client.py`, `docs/ORCHESTRATION_CONTRACT.md`, source-built Windmill code, and Studio service logs without printing private values.
3. Implement and live-verify the safe replacement identity/orchestrator route.
4. Run the Phase 06 diagnostic, retry/cancel/recovery, API/worker/web/browser gates; document and commit Studio-only work; then continue to Phase 07.
