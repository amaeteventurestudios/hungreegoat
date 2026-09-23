# Phase 06 — AI Producer

## Objective
Convert natural-language musical intent into validated structured production plans.

## Work
- AIProducerProvider abstraction
- OpenAI adapter
- OpenRouter adapter
- Anthropic/Claude adapter
- provider/model selection from Settings
- production-plan schema
- create/refine/version/activate
- Producer UI

## Missing Credential Behavior
If one or more provider credentials are unavailable, fully build/test the adapter contract and use available providers or mocks. Record only the unavailable credential in HUMAN_BLOCKERS.md and continue.

## Acceptance
At least one available real provider path should be verified when credentials exist; otherwise all noncredential behavior must be verified. Continue automatically.
