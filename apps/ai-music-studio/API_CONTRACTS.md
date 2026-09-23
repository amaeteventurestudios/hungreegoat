# API Contracts

## Versioning
Prefix V1 Studio endpoints with `/api/v1`.

## Projects
```text
GET    /projects
POST   /projects
GET    /projects/{project_id}
PATCH  /projects/{project_id}
```

## Songs
```text
POST   /projects/{project_id}/songs
GET    /songs/{song_id}
PATCH  /songs/{song_id}
```

## Production Plans
```text
POST   /songs/{song_id}/production-plans
GET    /songs/{song_id}/production-plans
POST   /production-plans/{plan_id}/activate
```

## Generations
```text
POST   /songs/{song_id}/generations
GET    /generations/{generation_id}
GET    /generations/{generation_id}/versions
POST   /versions/{version_id}/favorite
POST   /versions/{version_id}/approve
```

## Arrangements
```text
GET    /versions/{version_id}/arrangements
POST   /versions/{version_id}/arrangements
POST   /arrangements/{arrangement_id}/regenerate-section
```

## Audio
```text
POST   /assets/{asset_id}/analyze
POST   /assets/{asset_id}/tempo-transform
POST   /assets/{asset_id}/pitch-transform
```

## Stems
```text
POST   /assets/{asset_id}/stem-separation
GET    /stem-sets/{stem_set_id}
```

## Mastering
```text
POST   /assets/{asset_id}/master
GET    /masters/{master_id}
```

## Exports
```text
POST   /assets/{asset_id}/exports
GET    /exports/{export_id}
```

## Jobs
```text
GET    /jobs/{job_id}
POST   /jobs/{job_id}/cancel
POST   /jobs/{job_id}/retry
GET    /projects/{project_id}/jobs
```

## Assets
```text
POST   /projects/{project_id}/assets/upload
GET    /assets/{asset_id}
GET    /assets/{asset_id}/stream
GET    /assets/{asset_id}/download
```

## Settings
```text
GET    /settings/providers
PATCH  /settings/providers/{provider_name}
POST   /settings/providers/{provider_name}/health-check
GET    /settings/audio-defaults
PATCH  /settings/audio-defaults
```

## Long-Running Commands
Return `202 Accepted` with a normalized response containing:
- `job_id`
- `state`
- `resource_id` when known

## Errors
Normalize errors to:
```json
{
  "error": {
    "code": "string",
    "message": "human-readable message",
    "details": {}
  }
}
```

Provider-specific payloads must not escape through public Studio contracts.
