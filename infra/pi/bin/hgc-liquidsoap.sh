#!/bin/bash
# Runs the Liquidsoap engine for one station inside the official Savonet image
# (the Debian liquidsoap package segfaults on Raspberry Pi OS Trixie's FFmpeg).
# Foreground process so systemd owns its lifecycle.
set -euo pipefail
SID="${1:?station id}"
HG="$HOME/hungree-goat"
IMAGE="savonet/liquidsoap:v2.4.5"
case "$SID" in
  lofi)      HARBOR=8100; LIVE=8105 ;;
  afrobeats) HARBOR=8101; LIVE=8106 ;;
  *) echo "unknown station $SID" >&2; exit 2 ;;
esac
TOKEN=$(cat "$HG/secrets/internal.token")
LIVE_PW_FILE="$HG/secrets/live-$SID.password"
[ -f "$LIVE_PW_FILE" ] || (umask 077; head -c 18 /dev/urandom | base64 | tr -d '/+=' > "$LIVE_PW_FILE")
LIVE_PW=$(cat "$LIVE_PW_FILE")
LIVE_BIND=$(cat "$HG/data/live-bind-$SID" 2>/dev/null || echo 127.0.0.1)
NAME="hg-liq-$SID"
docker rm -f "$NAME" >/dev/null 2>&1 || true
exec docker run --rm --name "$NAME" --network host --user 1000:1000 \
  --memory 512m --cpus 1.5 --log-driver json-file --log-opt max-size=5m --log-opt max-file=2 \
  -v /media/hungree-goat:/media/hungree-goat:ro \
  -v "$HG/liquidsoap:/liq:ro" \
  -v "$HG/run:/run/hg" \
  -e HOME=/tmp \
  -e STATION="$SID" -e HARBOR_PORT="$HARBOR" -e LIVE_PORT="$LIVE" -e LIVE_BIND="$LIVE_BIND" \
  -e LIVE_PASSWORD="$LIVE_PW" -e BACKEND_URL=http://127.0.0.1:8090 -e INTERNAL_TOKEN="$TOKEN" \
  -e FALLBACK_M3U="/media/hungree-goat/playlists/$SID-fallback.m3u" \
  -e EMERGENCY_DIR=/media/hungree-goat/fallback \
  -e SOCKET_PATH="/run/hg/liq-$SID.sock" -e AUDIO_KBPS=192 \
  --entrypoint liquidsoap "$IMAGE" /liq/station.liq
