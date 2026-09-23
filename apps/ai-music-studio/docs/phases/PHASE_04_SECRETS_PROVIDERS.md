# Phase 04 — Secrets and Provider Configuration Layer

## Objective
Build the secure backend behind the Integrations dashboard.

## Work
- provider config records
- SecretStore abstraction
- secure secret storage strategy
- environment/bootstrap fallback
- provider enable/disable
- health checks
- model lists
- default-provider selection
- capability detection
- credential rotation
- deletion
- masked-secret responses only

## Principle
Database stores provider configuration and secret references, not casually exposed raw keys.

## Acceptance
Provider credentials can be added, replaced, disabled, tested, and rotated from the dashboard without source-code changes.
