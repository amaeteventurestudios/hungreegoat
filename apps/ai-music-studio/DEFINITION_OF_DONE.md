# Definition of Done

A Studio task is done only when all applicable criteria are met.

## Code
- implementation complete
- types clean
- lint clean
- relevant tests pass
- migrations included
- no fake/stub path presented as finished

## UX
- loading state
- empty state
- success state
- failure state
- retry path where relevant
- responsive behavior
- keyboard accessibility
- no obvious overflow/alignment defects

## Jobs
- durable state
- visible progress
- visible terminal status
- refresh-safe
- failure persisted
- retry semantics defined

## Audio
- source preserved
- output immutable
- lineage recorded
- metadata probed
- invalid media handled
- temporary files cleaned

## Monorepo
- no nested `.git`
- unrelated changes untouched
- sibling apps unchanged unless explicitly required
- cross-app regressions tested when relevant

## Docs
- phase status updated
- relevant subsystem docs updated
- architecture deviations recorded

## Deployment
For release-scoped work:
- clean build
- service health
- migration status
- secret safety
- backup impact understood
- existing Hungree Goat services remain healthy
