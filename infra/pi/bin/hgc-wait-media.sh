#!/bin/bash
# ExecStartPre helper: block (up to 3 minutes) until the HUNGREE-GOAT drive is
# mounted AND actually usable (a stale ext4 "shutdown" mount fails the write test).
for i in $(seq 1 90); do
  if findmnt -rn /media/hungree-goat >/dev/null 2>&1 && [ -d /media/hungree-goat/music ] \
     && touch /media/hungree-goat/.hgc-probe 2>/dev/null; then rm -f /media/hungree-goat/.hgc-probe; exit 0; fi
  sleep 2
done
echo "HUNGREE-GOAT drive not mounted/usable at /media/hungree-goat (run: sudo ~/hungree-goat/bin/hgc-usb-repair.sh)" >&2
exit 1
