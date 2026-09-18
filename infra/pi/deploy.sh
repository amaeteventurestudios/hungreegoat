#!/bin/bash
# Deploy HUNGREE Goat Control to pi-node-01 (user aumanah, no root needed).
#
# Normal use: run from a separate dev machine; rsyncs over SSH to $PI.
# LOCAL=1: run this directly ON pi-node-01 itself (e.g. an editing session with
# a local checkout of this repo already on the Pi's disk) — same file layout,
# just plain local copies instead of SSH/rsync-over-network, since source and
# destination are the same filesystem. Without this mode there is no way to
# apply this script's own deploy step while working directly on the box, which
# is exactly how apps/control/hgc and infra/pi/liquidsoap silently drifted
# from ~/hungree-goat/{app,liquidsoap} before (fixed by hand, see git log).
set -euo pipefail
H=$(cd "$(dirname "$0")/../.." && pwd); PI=${PI:-aumanah@192.168.6.235}
bash "$H/apps/control/scripts/sync-brand.sh"
if [ "${LOCAL:-0}" = "1" ]; then
  DEST=${DEST:-$HOME/hungree-goat}
  rsync -rt --exclude '__pycache__' "$H/apps/control/hgc/" "$DEST/app/hgc/"
  rsync -rt "$H/apps/control/static/" "$DEST/app/static/"
  rsync -rt "$H/infra/pi/bin/" "$DEST/bin/"; rsync -rt "$H/infra/pi/liquidsoap/" "$DEST/liquidsoap/"
  rsync -rt "$H/infra/systemd/" "$HOME/.config/systemd/user/"; cp "$H/infra/pi/RUNBOOK.md" "$DEST/README.md"
  chmod +x "$DEST"/bin/*.sh
  systemctl --user daemon-reload
  systemctl --user restart hungree-goat-control.service
  sleep 3
  curl -sf http://127.0.0.1:8090/api/health && echo " control ok"
else
  rsync -rt --exclude '__pycache__' "$H/apps/control/hgc/" "$PI:hungree-goat/app/hgc/"
  rsync -rt "$H/apps/control/static/" "$PI:hungree-goat/app/static/"
  rsync -rt "$H/infra/pi/bin/" "$PI:hungree-goat/bin/"; rsync -rt "$H/infra/pi/liquidsoap/" "$PI:hungree-goat/liquidsoap/"
  rsync -rt "$H/infra/systemd/" "$PI:.config/systemd/user/"; scp -q "$H/infra/pi/RUNBOOK.md" "$PI:hungree-goat/README.md"
  ssh "$PI" 'chmod +x ~/hungree-goat/bin/*.sh; export XDG_RUNTIME_DIR=/run/user/1000; systemctl --user daemon-reload; systemctl --user restart hungree-goat-control.service; sleep 3; curl -sf http://127.0.0.1:8090/api/health && echo " control ok"'
fi
echo "deployed to app/hgc + static + bin + liquidsoap. Restart hungree-goat-stream@lofi if streamer.py/streamer_vertical.py changed; restart hungree-goat-liquidsoap@lofi if station.liq changed. Neither is auto-restarted here since both interrupt the live broadcast."
