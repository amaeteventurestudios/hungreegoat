# Phase 01 — Platform Foundation

## Objective
Create the Studio service foundation without affecting existing Hungree Goat services.

## Work
- Next.js + React + TypeScript web app
- shadcn/ui + Base UI + Tailwind
- FastAPI API
- PostgreSQL
- SQLAlchemy/Alembic
- Docker Compose Studio services
- configuration loader
- structured logging
- health endpoints
- development/production service wiring

## Acceptance
Codex verifies build, API→DB, migrations, web→API, Compose config, and service health, fixes failures, then continues to Phase 02.
