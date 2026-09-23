# Phase 10 — Arrangement and Section Editing

## Objective
Build non-destructive song structure editing.

## Sections
- Intro
- Verse
- Chorus
- Bridge
- Outro

## Editable Properties
- duration
- energy
- instrumentation
- production notes
- vocal instructions

## Work
- timeline
- section inspector
- arrangement versions
- revision history
- section regeneration when provider supports it
- fallback when provider does not

## Acceptance
Arrangement revisions are versioned, non-destructive, and capability-aware.

## Verified implementation — 2026-09-23

An approved ready generation version can own one or more immutable arrangement
revisions. The Studio API validates bounded section plans, serializes revisions by
locking the source version, and rejects a stale `base_revision` instead of
overwriting another editor's work. Every revision references the same immutable
source audio asset; earlier section plans remain queryable. The workstation has a
proportional section timeline, type/duration/energy/instrumentation/production/vocal
inspector, add/remove/reorder controls, and revision-history restore as a new
revision. Section regeneration is not exposed because the current worker adapter
does not offer a section-targeted operation; the UI states that edits are
structural directions and leaves audio unchanged.

Real PostgreSQL API tests cover approved-source enforcement, version conflicts,
validation, source linkage, and immutable prior revisions. Fixture browser tests
cover editing and restoration at four viewport widths without a paid provider call.
