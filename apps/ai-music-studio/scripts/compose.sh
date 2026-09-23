#!/usr/bin/env bash
set -euo pipefail
studio_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec docker compose --env-file "$studio_root/.env" -f "$studio_root/infra/docker/compose.yaml" "$@"
