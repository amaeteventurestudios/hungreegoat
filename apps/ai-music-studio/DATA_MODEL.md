# Data Model

Use UUID primary keys and UTC timestamps.

## Core Entities
- users
- workspaces
- projects
- songs
- production_plans
- generations
- generation_versions
- arrangements
- audio_assets
- asset_lineage
- audio_analysis
- tempo_versions
- stem_sets
- stems
- mix_versions
- masters
- exports
- jobs
- job_events
- provider_configs
- workspace_settings

## Provider Config
Minimum:
- id
- workspace_id
- provider_type
- provider_name
- enabled
- secret_reference
- masked_secret_hint
- default_model
- nonsecret_config_json
- capabilities_json
- health_status
- last_health_check_at
- created_at
- updated_at

Never store raw provider API keys in ordinary provider configuration columns.

## Hierarchy
```text
Workspace
└── Project
    └── Song
        ├── Production Plan versions
        ├── Generations
        │   └── Generation Versions
        ├── Arrangements
        ├── Tempo Versions
        ├── Stem Sets
        ├── Mix Versions
        ├── Masters
        └── Exports
```

## Assets
Every audio transformation produces a new immutable `audio_asset` and lineage record.

## Rules
- JSONB is for flexible/provider metadata, not a substitute for relational design.
- Raw secrets never live in ordinary DB config fields.
- Application code references logical asset IDs.
