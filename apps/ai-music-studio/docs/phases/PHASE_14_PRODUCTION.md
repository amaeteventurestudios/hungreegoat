# Phase 14 — Production Hardening and Launch

## Objective
Deploy and verify the finished Studio at https://studio.hungreegoat.com.

## Work
- Studio-only nginx route on the actual shared gateway (ADR-027 supersedes the Caddy assumption)
- HTTPS
- secure secrets
- service restart/recovery
- backups
- restore test
- disk monitoring
- Uptime Kuma
- API health
- Windmill health
- worker health
- provider health
- resource limits
- structured logging
- security headers
- production smoke tests
- full E2E test
- verify Control/Player/DJ/broadcast remain healthy

## Acceptance
Studio is production-ready, observable, backed up, secure, and does not disrupt existing Hungree Goat services.

## Current verification (2026-09-23)

The isolated `hg-studio-prod` stack is running with production cookies, restricted Windmill identity, real worker audio, and loopback-only web/API/Kuma. A real authenticated mastering smoke passed, including immutable-source SHA-256, source/master 206 byte-range streaming, and session/audio persistence after a Studio-only PostgreSQL/API restart. A production-origin browser smoke used loopback request routing to verify authenticated shell, 12 desktop routes, and three mobile routes with no console, failed request, server, or overflow errors; this is not a substitute for public TLS verification. Compose limits, security headers, structured API request logs, 0600 private files, API migration drift, 56 PostgreSQL API tests, and 120 responsive browser checks are verified. Uptime Kuma's three internal checks are UP, the read-only timer reports worker ping and backup recency, seven encrypted artifacts restore successfully into disposable PostgreSQL/SQLite environments, and a complete eight-file encrypted backup set was copied to a separate host with matching checksums and a daily timer. Both gateway nginx templates pass syntax checks without touching the shared gateway. Home, Player, and Control returned HTTP 200, and the existing broadcast containers remained running after Studio deployment.

The public HTTPS acceptance gate remains open: `studio.hungreegoat.com` still fails TLS because the shared gateway lacks a Studio vhost/certificate and available SSH identity is read-only. GitHub also reports that the separately connected Vercel Studio project failed its build; its private log/settings require unavailable Vercel access and its shell cannot reach the private API. The canonical production path remains Compose/nginx. Exact external-action proof is in `docs/HUMAN_BLOCKERS.md`. Public browser/TLS/range verification and independently escrowed backup passphrase remain required before launch can be marked complete. Paid-provider live calls are not claimed without real credentials.
