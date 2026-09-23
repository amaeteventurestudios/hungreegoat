# Security

## V1 Goals
- private Studio access
- no secrets in browser bundles
- no hardcoded provider credentials
- safe uploads
- safe process invocation
- least privilege
- HTTPS
- auditable jobs

## Secret Management
Implement a `SecretStore` abstraction.

Provider configuration records may store:
- provider name
- enabled state
- secret reference
- masked identifier/last characters
- model/default settings
- health status
- timestamps

Raw provider secrets must be stored server-side using a secure implementation appropriate to the deployment. They must never be committed to Git or returned to the browser after storage.

Settings → Integrations must permit credential rotation without source-code changes.

Environment variables may bootstrap infrastructure secrets, but provider credential management should not require editing source code.

## Uploads
Enforce limits, probe server-side, generate storage keys, block path traversal, and isolate temporary processing directories.

## Process Safety
FFmpeg, Rubber Band, Demucs, and Matchering arguments must come from typed validated values. Never concatenate arbitrary user text into shell commands.

## Authentication
Use secure sessions/cookies and appropriate CSRF defenses.

## Authorization
Project/song/asset access is scoped to authenticated workspace/user.

## Network
Caddy exposes Studio. PostgreSQL, Windmill internals, secret storage, and worker ports remain private.

## Logs
Redact API keys, tokens, authorization headers, signed URLs, and private provider headers.

## Monorepo Safety
Studio work must not weaken existing Hungree Goat Control, Player, DJ, or broadcast security.
