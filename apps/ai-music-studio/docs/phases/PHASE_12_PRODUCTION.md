# Phase 12 — Production Hardening

## Objective
Deploy a secure, observable, recoverable Studio at `studio.hungreegoat.com`.

## Work
Auth hardening, Caddy, TLS, secrets, backups, restore test, Uptime Kuma, resource limits, security headers, smoke tests, runbook.

## Acceptance
- production URL works over HTTPS
- services restart cleanly
- backup/restore documented
- internal ports not exposed
- full Studio journey succeeds
- existing Hungree Goat Control/Player/DJ/broadcast remain healthy
