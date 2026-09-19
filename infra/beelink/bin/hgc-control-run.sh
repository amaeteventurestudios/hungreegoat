#!/bin/bash
# Runs the HUNGREE Goat control app (API + dashboard + DJ Studio) inside the
# hungree-goat/hgc image, isolated from the rest of this shared host (ai-node-01)
# by an explicit memory ceiling. Host networking: the app needs to reach
# Liquidsoap's loopback harbors and the stream containers need to reach it back,
# same convention as hgc-liquidsoap.sh.
#
# The app also shells out to `systemctl --user` (services.py) to report and
# control the Liquidsoap/stream units for the dashboard's status/start/stop/
# restart controls and USB-repair trigger — the same host systemd session this
# container's own uid (1000/aumanah) already owns, so mounting its D-Bus socket
# grants no privilege the process doesn't already have as that user; the app's
# own API only ever addresses the 3 Hungree Goat unit names (see services.UNITS),
# never an arbitrary one, so this can't reach unrelated units like
# hermes-gateway.service even though the bus technically could.
# --pid host is also required: dbus-broker (the user session bus) explicitly
# refuses/limits connections from a peer in a different PID namespace as an
# anti-spoofing check, independent of the socket connect + SASL auth (which
# succeed fine without it) — confirmed by testing.
set -euo pipefail
HG="$HOME/hungree-goat"
IMAGE="hungree-goat/hgc:latest"
NAME="hgc-control"
docker rm -f "$NAME" >/dev/null 2>&1 || true
exec docker run --rm --name "$NAME" --network host --pid host --user 1000:1000 \
  --memory 768m --memory-reservation 256m \
  --log-driver json-file --log-opt max-size=5m --log-opt max-file=3 \
  -v "$HG:$HG" \
  -v /media/hungree-goat:/media/hungree-goat \
  -v /run/user/1000:/run/user/1000 \
  -e HOME=/tmp -e HGC_HOME="$HG" -e HGC_MEDIA=/media/hungree-goat \
  -e XDG_RUNTIME_DIR=/run/user/1000 -e DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
  -w "$HG/app" \
  "$IMAGE" /srv/hgc/venv/bin/python -m hgc serve
