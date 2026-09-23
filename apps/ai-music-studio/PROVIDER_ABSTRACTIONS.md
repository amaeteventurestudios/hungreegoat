# Provider Abstractions

## Rule
Domain and UI code depend on normalized interfaces, never vendor SDK schemas.

## AIProducerProvider
Methods:
- create_plan
- refine_plan
- health_check

Initial adapters:
- OpenAI
- Claude

## MusicGenerationProvider
Methods:
- generate
- get_status
- cancel
- download_outputs
- health_check

Initial adapter:
- ElevenLabs Music

## AudioAnalyzer
Methods:
- analyze
- health_check

Initial implementation:
- FFprobe
- librosa
- SoundFile

## TempoProcessor
Methods:
- transform
- health_check

Initial adapter:
- Rubber Band

## StemSeparator
Methods:
- separate
- health_check

Initial adapter:
- Demucs

## MasteringProvider
Methods:
- master
- health_check

Initial adapter:
- Matchering

## StorageProvider
Methods:
- put
- open
- delete
- get_download_reference

Initial adapter:
- local filesystem

Future:
- S3-compatible object storage

## Normalized Errors
Map provider/engine failures into internal codes such as:
- provider_auth_failed
- provider_rate_limited
- provider_timeout
- provider_rejected
- provider_unavailable
- unsupported_operation
- invalid_media
- processing_failed
