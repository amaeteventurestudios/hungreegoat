#!/bin/bash
# Run ON THE PI as aumanah: creates the tunnel key + user unit. Copy the printed public key into infra/gateway/tunnel/hg-tunnel.pub.
set -euo pipefail
[ -f ~/.ssh/hg-tunnel ] || ssh-keygen -t ed25519 -N "" -f ~/.ssh/hg-tunnel -C "hungree-goat-tunnel@pi-node-01" >/dev/null
mkdir -p ~/.config/systemd/user; cp "$(dirname "$0")/tunnel/hungree-goat-tunnel.service" ~/.config/systemd/user/
export XDG_RUNTIME_DIR=/run/user/$(id -u); systemctl --user daemon-reload; systemctl --user enable --now hungree-goat-tunnel.service
echo "public key:"; cat ~/.ssh/hg-tunnel.pub
