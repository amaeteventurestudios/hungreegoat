# Architecture

## Intent
AI Music Studio is a new application inside the Hungree Goat monorepo with its own product and deployment boundary.

```text
Browser / shadcn UI
        ↓
Studio API / FastAPI
        ├── PostgreSQL domain state
        ↓
Orchestration Client
        ↓
Windmill
        ├── worker-ai
        ├── worker-audio
        ├── worker-separation
        └── worker-master
             ├── ElevenLabs
             ├── OpenAI / Claude
             ├── FFmpeg / librosa / SoundFile
             ├── Rubber Band
             ├── Demucs
             └── Matchering
```

## Responsibility Boundaries
### Web
Navigation, forms, playback, visualization, progress/status display, user interaction.

Not secrets, provider calls, long-running processing, or canonical workflow state.

### Studio API
Authentication/authorization, CRUD, validation, job creation, asset access, auditability, normalized provider configuration.

Never perform long-running audio processing in request threads.

### PostgreSQL
Canonical truth for projects, songs, plans, generations, arrangements, assets, lineage, tempo versions, stem sets, masters, exports, and domain-facing jobs.

### Windmill
Execution, retries, worker routing, operational logs, workflow progress.

Windmill does not replace domain state.

## Core Interfaces
- AIProducerProvider
- MusicGenerationProvider
- AudioAnalyzer
- TempoProcessor
- StemSeparator
- MasteringProvider
- StorageProvider
- OrchestrationClient

## Immutability
Every transformation creates a new audio asset.

Example:
`source → generation-v3 → tempo-128-v1 → stem-set-v1 → mix-v2 → master-v1 → mp3-export-v1`

## Storage
V1 uses a local persistent filesystem behind `StorageProvider`. Database records reference logical asset IDs. Public URLs and local paths must not be conflated.

Future object storage can use an S3-compatible adapter such as SeaweedFS.

## Deployment Boundary
`studio.hungreegoat.com` is a separate application surface. Existing Control, Player, DJ, and broadcast behavior must not be coupled to Studio internals.

## Future-Proofing
Do not introduce Kubernetes, Kafka, RabbitMQ, Elasticsearch, or Temporal in V1 without measured need.
