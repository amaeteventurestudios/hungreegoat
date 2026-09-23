# Phase 07 — AI Producer

## Objective
Turn natural-language musical ideas into structured production plans.

## Providers
- OpenAI
- OpenRouter
- Anthropic/Claude

## Structured Output
- style
- BPM
- key
- instrumentation
- structure
- energy curve
- vocal direction
- arrangement guidance
- negative instructions
- production notes

## Work
- AIProducerProvider abstraction
- provider adapters
- model selection from Settings
- plan creation/refinement/versioning
- Producer UI

## Acceptance
Idea → validated structured production plan with provider switching through Settings.
