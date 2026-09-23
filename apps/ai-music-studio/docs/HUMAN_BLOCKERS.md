# HUMAN_BLOCKERS.md — External Human Actions Only

## Purpose

This file is **not** a technical-issues list.

Technical failures belong in execution plans/handoffs and should be solved autonomously.

Only add an item here when a specific external human action is literally impossible for Codex to perform.

## Required Proof

Every entry must state:
1. exact blocked requirement
2. exact external human action required
3. why Codex cannot perform it
4. safe automation paths already exhausted
5. relevant commands/endpoints/errors
6. official docs/source/issues checked
7. architecture-preserving alternatives considered
8. why those alternatives cannot satisfy the requirement
9. independent work that continues despite the blocker

Without that proof, the item is not a human blocker.

## Valid Examples

- inaccessible MFA/2FA approval
- CAPTCHA
- payment/purchase authorization
- legal/terms acceptance
- inaccessible email verification
- external credential that does not exist and cannot be programmatically obtained
- external control plane with no authorized interface
- destructive action outside Studio scope that cannot be isolated safely

## Explicit Non-Examples

Do not put these here by themselves:
- API/HTTP error
- CLI error
- broken/contradictory docs
- OSS edition limitation
- service-account limitation
- local user/token creation
- admin/config action Codex can perform
- version incompatibility
- need to upgrade/downgrade
- need to replace a component
- need to research upstream code/issues
- need to choose an architecture

## Existing Entries

Any blocker written by a prior session must be re-proven against this standard before it can stop work.

The Windmill runtime-identity/provisioning issue is currently a **technical issue pending autonomous solution/substitution**, not a human-only blocker.
