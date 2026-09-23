# Deployment

## Source and Runtime
- Canonical source: `/home/aumanah/hungree-goat-src/hungreegoat-canonical/apps/ai-music-studio`
- Runtime tree: `/home/aumanah/hungree-goat`
- Production URL: `https://studio.hungreegoat.com`

The canonical Git checkout is source of truth. Do not depend on manual runtime edits.

## Expected Studio Services
- studio-web
- studio-api
- studio-postgres
- studio-windmill
- studio-worker-ai
- studio-worker-audio
- studio-worker-separation
- studio-worker-master
- Caddy integration

Names may be adjusted to avoid collisions with existing services.

## Persistence
Suggested:
```text
/srv/ai-music-studio/data/postgres
/srv/ai-music-studio/data/assets
/srv/ai-music-studio/backups
/srv/ai-music-studio/secrets
```

Generated audio must not live inside the Git checkout.

## Caddy
- TLS for `studio.hungreegoat.com`
- route web
- route API
- security headers
- preserve HTTP range requests for audio
- do not break existing Hungree Goat hostnames

## Deployment Sequence
1. build from canonical source
2. validate Compose/config
3. back up affected configuration
4. run migrations
5. start/update Studio services
6. update Caddy route
7. verify HTTPS
8. run smoke tests
9. verify existing Hungree Goat services remain healthy

Studio deployment must not restart or interrupt the existing broadcast/player/control stack unless explicitly planned.
