# Data Model

Use UUID primary keys and UTC timestamps.

## Core Entities
- users
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

## Hierarchy
```text
Project
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

## audio_assets
Minimum fields:
- id
- project_id
- song_id
- kind
- storage_provider
- storage_key
- original_filename
- mime_type
- size_bytes
- sha256
- duration_seconds
- sample_rate
- channels
- bit_depth
- created_at

## asset_lineage
- parent_asset_id
- child_asset_id
- transformation_type
- transformation_metadata_json

## provider_configs
- id
- provider_type
- provider_name
- enabled
- nonsecret_config_json
- secret_reference
- health_status
- last_health_check_at

## Rules
- JSONB is for flexible/provider metadata, not a substitute for relational design.
- Never store raw API keys in ordinary database columns.
- Assets are immutable after successful promotion.
- Application code references logical asset IDs, not arbitrary public filesystem paths.
