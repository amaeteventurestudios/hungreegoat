# Phase 12 — Production Hardening & Launch

## Objective
Deploy and verify the complete Studio at `https://studio.hungreegoat.com`.

## Work
- production Compose/service definitions
- Caddy route/TLS
- security headers
- authentication hardening
- secrets permissions
- migrations
- backup scripts
- restore test
- Uptime Kuma monitors
- structured log review
- disk/resource checks
- provider/engine health
- E2E production smoke test
- visual production QA
- restart/recovery testing
- verify existing Hungree Goat services remain healthy
- final documentation/report

## Human Blockers
Only external actions that cannot be completed autonomously remain in `docs/HUMAN_BLOCKERS.md`. Do not stop early for them; finish every independent production task first.

## Acceptance
Codex validates production URL, TLS, API, DB, workers, audio paths, backups, monitoring, and regression health for existing Hungree Goat services. Then produce one consolidated final report.
