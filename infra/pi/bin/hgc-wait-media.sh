#!/bin/bash
MEDIA="${HGC_MEDIA:-/srv/ai-node/storage/data}"
# ExecStartPre helper: block (up to 3 minutes) until the HUNGREE-GOAT drive is
# mounted AND actually usable (a stale ext4 "shutdown" mount fails the write test).
for i in $(seq 1 90); do
  if findmnt -rn "$MEDIA" >/dev/null 2>&1 && [ -d "$MEDIA/music" ] \
     && touch "$MEDIA/.hgc-probe" 2>/dev/null; then rm -f "$MEDIA/.hgc-probe"; exit 0; fi
  sleep 2
done
echo "HUNGREE-GOAT data drive not mounted/usable at $MEDIA (run: sudo ~/hungree-goat/bin/hgc-usb-repair.sh)" >&2
exit 1
