# HUMAN_BLOCKERS.md — External Human Actions Only

## Purpose

This file is not a technical-issues list. Technical failures belong in execution plans and handoffs and must be solved autonomously.

Add an item only when a specific external human action is literally impossible for Codex to perform with available permissions and tools.

## Required Proof

Every entry must state:

1. the exact blocked requirement;
2. the exact external human action required;
3. why Codex cannot perform it;
4. safe automation paths already exhausted;
5. relevant commands, endpoints, and errors;
6. official docs/source/issues checked;
7. architecture-preserving alternatives considered;
8. why those alternatives cannot satisfy the requirement; and
9. independent work that continues despite it.

## Explicit Non-Examples

Do not record an API/CLI error, OSS limitation, local-user/token task, version mismatch, migration, component replacement, research need, or technical choice as a human blocker by itself.

## Current Status

No entry is currently authorized to halt the autonomous build. The Windmill runtime-identity issue is a technical substitution investigation, not a human-only blocker.
