#!/bin/bash
# Deploy HUNGREE Goat Control to pi-node-01 (user aumanah, no root needed).
set -euo pipefail
H=$(cd "$(dirname "$0")/../.." && pwd); PI=${PI:-aumanah@192.168.6.235}
bash "$H/apps/control/scripts/sync-brand.sh"
rsync -rt --exclude '__pycache__' "$H/apps/control/hgc/" "$PI:hungree-goat/app/hgc/"
rsync -rt "$H/apps/control/static/" "$PI:hungree-goat/app/static/"
rsync -rt "$H/infra/pi/bin/" "$PI:hungree-goat/bin/"; rsync -rt "$H/infra/pi/liquidsoap/" "$PI:hungree-goat/liquidsoap/"
rsync -rt "$H/infra/systemd/" "$PI:.config/systemd/user/"; scp -q "$H/infra/pi/RUNBOOK.md" "$PI:hungree-goat/README.md"
ssh "$PI" 'chmod +x ~/hungree-goat/bin/*.sh; export XDG_RUNTIME_DIR=/run/user/1000; systemctl --user daemon-reload; systemctl --user restart hungree-goat-control.service; sleep 3; curl -sf http://127.0.0.1:8090/api/health && echo " control ok"'
echo "deployed. Restart the audio engine only if station.liq changed: systemctl --user restart hungree-goat-liquidsoap@lofi"
