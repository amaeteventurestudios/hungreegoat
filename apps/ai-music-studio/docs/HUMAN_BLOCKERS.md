# HUMAN_BLOCKERS.md

## Standard

This file contains only **proven human-only blockers**.

A failed technical path, API error, admin operation, credential-related task, product-tier limitation, or undocumented behavior is not sufficient by itself.

Before adding an item here, Codex must have exhausted the safe supported automation paths available from the current environment and must document:

- exact blocked requirement
- automation paths attempted
- relevant commands/endpoints and error summaries
- official docs/source/issues consulted
- alternative supported designs considered
- why remaining alternatives are unsafe, unsupported, or unavailable
- exact external human action required
- why Codex cannot perform that action
- independent work that can still continue

If Codex has the necessary shell access, credentials, authorization, API access, container access, or tools to perform an action, the action is not human-only.

A blocker to one subtask must not stop independent work elsewhere.

## Valid Human-Only Examples

- MFA/2FA approval on an inaccessible device
- CAPTCHA
- payment/purchase authorization
- legal/terms acceptance
- inaccessible email verification
- credential that does not exist and cannot be obtained programmatically
- registrar/DNS action with no authorized interface
- destructive external action requiring explicit owner authorization

## Current Entries

Existing entries must be re-evaluated against this standard before being treated as active human blockers.
