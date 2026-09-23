# Testing and QA

## Unit
Cover:
- state transitions
- provider normalization
- tempo math
- asset lineage
- validation
- idempotency logic

## API
Cover:
- CRUD
- authorization
- 202 job creation
- retry/cancel
- error envelopes
- asset access
- range streaming where applicable

## Workflow
Cover:
- submission
- progress
- retry
- failure
- cancellation
- worker interruption
- result persistence

## Integration
Verify real engine/provider paths where practical:
- selected AI producer provider
- ElevenLabs Music
- FFmpeg
- Rubber Band
- Demucs
- Matchering

## E2E
Core journey:
1. create project/song
2. create production plan
3. generate versions
4. compare and approve
5. tempo transform
6. separate stems
7. master
8. export
9. refresh and recover

## Visual QA
Required:
- 1440×900
- 1280×800
- 1024×768
- approximately 390px mobile

Check clipping, overflow, responsive stacking, form alignment, waveform resize, long titles, modal width, and loading/empty/error states.

## Fixtures
Use short legally safe audio fixtures. CI must not depend on copyrighted commercial tracks.

## Monorepo Regression
If Studio work touches `apps/control`, `apps/player`, or `apps/dj-studio`, run that sibling app's relevant existing tests too.
