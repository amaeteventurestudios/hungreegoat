# Security

## V1 Goals
- private Studio access
- no secrets in browser bundles
- no secrets in Git
- safe uploads
- safe process invocation
- least privilege
- HTTPS
- auditable jobs

## Secrets
Never:
- commit secret-bearing `.env` files
- store raw API keys in ordinary DB columns
- print credentials in logs
- return provider secrets to the browser

## Uploads
- enforce size limits
- probe/decode server-side
- generate server-side storage keys
- never trust filenames as paths
- block traversal
- isolate temporary processing directories

## Process Safety
FFmpeg, Rubber Band, Demucs, and Matchering arguments must be created from typed validated values.

Never concatenate arbitrary user text into shell commands.

## Authentication
V1 may use simple private authentication, but sessions must use secure cookie settings and appropriate CSRF protections for the chosen pattern.

## Authorization
Project/song/asset access must be scoped to the authenticated user/workspace.

## Network
Caddy exposes the Studio surface. Do not expose PostgreSQL, Windmill internals, or worker ports publicly.

## Logs
Redact:
- API keys
- bearer tokens
- private provider headers
- signed tokens/URLs

## Monorepo Safety
Studio work must not weaken controls in existing Hungree Goat Control, Player, DJ Studio, or broadcast services.
