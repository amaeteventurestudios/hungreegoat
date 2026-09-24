#!/usr/bin/env bash
set -euo pipefail
studio_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
studio_env_file="${STUDIO_COMPOSE_ENV_FILE:-$studio_root/.env}"
if [[ ! "$studio_env_file" = /* || ! -f "$studio_env_file" ]]; then
  echo "Studio Compose requires an absolute existing environment file." >&2
  exit 1
fi
exec docker compose --env-file "$studio_env_file" -f "$studio_root/infra/docker/compose.yaml" "$@"
