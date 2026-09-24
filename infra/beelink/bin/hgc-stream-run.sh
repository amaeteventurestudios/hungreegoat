#!/bin/bash
# Runs the HUNGREE Goat video stream controller (BgFeeder + main FFmpeg -> RTMPS)
# for one station, isolated from the rest of this shared host by a memory ceiling.
# --cpu-shares (not --cpus): a hard CPU cap risks dropped frames if the encode
# ever needs a burst; a relative share still gives Ollama/other containers fair
# scheduling under real contention without throttling this in the common case
# where the box is otherwise idle. GPU passthrough: /dev/dri/renderD128 + the
# host's render group so the VAAPI decode/encode path in streamer.py works.
set -euo pipefail
# Media root: the data drive. Override with HGC_MEDIA (the systemd units set it explicitly).
MEDIA="${HGC_MEDIA:-/srv/ai-node/storage/data}"
SID="${1:?station id}"
HG="$HOME/hungree-goat"
IMAGE="hungree-goat/hgc:latest"
NAME="hgc-stream-$SID"
RENDER_GID=$(getent group render | cut -d: -f3)
docker rm -f "$NAME" >/dev/null 2>&1 || true
exec docker run --rm --name "$NAME" --network host --user 1000:1000 \
  --device /dev/dri/renderD128 --group-add "$RENDER_GID" \
  --memory 640m --memory-reservation 192m --cpu-shares 1024 \
  --log-driver json-file --log-opt max-size=5m --log-opt max-file=3 \
  -v "$HG:$HG" \
  -v "$MEDIA:$MEDIA" \
  -e HOME=/tmp -e HGC_HOME="$HG" -e HGC_MEDIA="$MEDIA" \
  -e HGC_HW_BACKEND=vaapi -e HGC_VAAPI_DEVICE=/dev/dri/renderD128 \
  -w "$HG/app" \
  "$IMAGE" /srv/hgc/venv/bin/python -m hgc stream "$SID"
