#!/bin/bash
# HUNGREE-GOAT drive repair — must run as root (sudo).
# Handles the case where the SanDisk drops off the USB bus and re-enumerates
# (stale ext4 "shutdown" mount on the old device node). Never reformats.
set -u
UUID=7d12ed26-3a1f-45c6-a1ce-37c5097c3d11
MNT="${HGC_MEDIA:-/srv/ai-node/storage/data}"
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
echo "== current state"; findmnt -rn "$MNT" || echo "not mounted"
DEV=$(blkid -U "$UUID" || true)
echo "device with HUNGREE-GOAT UUID: ${DEV:-NOT FOUND}"
if findmnt -rn "$MNT" >/dev/null; then
  echo "== stopping station services"; sudo -u aumanah XDG_RUNTIME_DIR=/run/user/1000 systemctl --user stop 'hungree-goat-stream@*' 'hungree-goat-liquidsoap@*' 2>/dev/null || true
  echo "== unmounting every layer (a stale mount from a dropped device can sit under the live one)"
  for _ in 1 2 3 4 5 6; do findmnt -rn "$MNT" >/dev/null 2>&1 || break; umount "$MNT" 2>/dev/null || umount -l "$MNT" || true; done
  findmnt -rn "$MNT" >/dev/null 2>&1 && { echo "still mounted at $MNT after unmounting; stopping"; exit 5; }
fi
if [ -z "$DEV" ]; then
  echo "Drive not present on the USB bus. Unplug it, wait 10 s, plug it back in, then rerun this script."; exit 2
fi
echo "== filesystem check on $DEV (no reformat, auto-fix)"
FSCK_LOG=/var/log/hgc-usb-repair.log
{ echo "=== $(date -Is) fsck $DEV"; } >> "$FSCK_LOG"
fsck.ext4 -f -y "$DEV" 2>&1 | tee -a "$FSCK_LOG"
rc=${PIPESTATUS[0]}          # e2fsck's own exit code, not tee's
echo "e2fsck exit=$rc  (0=no errors, 1=errors corrected, 2=corrected+reboot advised, 4=uncorrected, 8=operational error)"
grep -qi "recovering journal" "$FSCK_LOG" && echo "note: journal was replayed (this alone reports exit 0)"
echo "exit=$rc" >> "$FSCK_LOG"
if [ "$rc" -ge 4 ]; then echo "fsck could not repair; stopping here to protect data"; exit 3; fi
echo "== mounting"; mount "$MNT" || mount -U "$UUID" "$MNT" || { echo "mount failed"; exit 4; }
findmnt -rn "$MNT"
sudo -u aumanah touch "$MNT/.hgc-write-test" && rm -f "$MNT/.hgc-write-test" && echo "write test OK"
echo "== restarting station services"
U="sudo -u aumanah XDG_RUNTIME_DIR=/run/user/1000 systemctl --user"
$U is-active hungree-goat-control.service >/dev/null || $U start hungree-goat-control.service
sleep 3
$U start hungree-goat-liquidsoap@lofi.service hungree-goat-stream@lofi.service
echo "done"
