# Provider Abstractions

## Rule
Domain and UI code depend on normalized interfaces, never vendor SDK schemas.

## AIProducerProvider
Methods:
- create_plan
- refine_plan
- list_models where supported
- health_check

Initial adapters:
- OpenAI
- OpenRouter
- Anthropic/Claude

## MusicGenerationProvider
Methods:
- generate
- get_status
- cancel
- download_outputs
- list_models/capabilities where supported
- health_check

Initial adapter:
- ElevenLabs Music

## SecretStore
Methods:
- set_secret(provider, value)
- has_secret(provider)
- masked_secret(provider)
- get_secret_for_server_use(provider)
- delete_secret(provider)

Raw secret retrieval is server-only and never exposed through public API responses.

## Provider Configuration
Normalized fields:
- provider
- enabled
- secret_reference
- masked_secret
- default_model
- capabilities
- health_status
- last_health_check_at
- nonsecret_options

## AudioAnalyzer
Initial:
- FFprobe
- librosa
- SoundFile

## TempoProcessor
Initial:
- Rubber Band

## StemSeparator
Initial:
- Demucs

## MasteringProvider
Initial:
- Matchering

## StorageProvider
Initial:
- local filesystem

Future:
- S3-compatible object storage

## Errors
Normalize provider/engine failures:
- provider_auth_failed
- provider_rate_limited
- provider_timeout
- provider_rejected
- provider_unavailable
- unsupported_operation
- invalid_media
- processing_failed
