# MODEL_ROUTING.md — Cost-Aware Multi-Agent Routing

## Goal

Use the least expensive model that can reliably complete the task. The coordinator delegates aggressively instead of doing all implementation itself.

Before costly delegation:

```bash
/home/aumanah/.local/bin/codex-usage-guard
```

## Default Coordinator

**Sol Medium**
- decomposition
- dependency ordering
- architecture oversight
- conflict avoidance
- review/integration
- phase acceptance
- final verification

The coordinator should not consume premium reasoning on routine implementation that a cheaper worker can do.

## Workers

### Luna Low
Use for:
- repo/file discovery
- deterministic scans
- repetitive checks
- lint/test enumeration
- documentation cleanup
- simple metadata changes

### Luna Medium
Use for:
- straightforward mechanical refactors
- simple low-risk UI changes
- clearly specified repetitive implementation

### Terra Medium
Default implementation worker:
- React/shadcn
- FastAPI
- PostgreSQL models/migrations
- routine APIs
- normal tests
- Docker/Compose
- provider plumbing

### Terra High
Use for:
- difficult multi-file implementation
- runtime/integration recovery
- Windmill/orchestration debugging
- hard build/runtime failures
- complex cross-layer work

### Sol Low / Medium
Use selectively for:
- architecture-sensitive code
- difficult state/concurrency
- hard audio-pipeline edge cases
- integration review
- failures unresolved after Terra attempts

### Astra
Exceptional escalation only.
Do not use Astra for routine implementation or continuous autonomous execution.

## Child Routing Rules

Always specify both:
- model
- reasoning effort

Do not rely on inherited parent defaults.

This environment has verified explicit child routing for Luna Low, Terra Medium, and Sol Low.

## Failure Escalation

1. diagnose;
2. retry same tier if procedural;
3. use an alternative implementation;
4. escalate one model tier if reasoning complexity warrants it;
5. do not jump directly to Astra.

## Usage-Aware Routing

- <70% used: normal routing
- 70–79%: no Astra; minimize Sol; prefer Luna/Terra; finish current coherent work
- >=80%: spawn no new workers; checkpoint/handoff/stop

## Autonomy

A worker or coordinator does not need owner approval to select a model, spawn an agent, change implementation approach, or escalate/de-escalate within this policy.
