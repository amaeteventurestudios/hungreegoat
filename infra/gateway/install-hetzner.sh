#!/bin/bash
# Run as root ON THE GATEWAY (2.29.28.125, hostname hetzner-usg). Creates the restricted
# tunnel user, installs the nginx sites and requests certificates. Requires: the Pi's
# tunnel public key (infra/gateway/tunnel/hg-tunnel.pub) and DNS A records for
# api.hungreegoat.com and control.hungreegoat.com pointing at this server.
#
# VERIFIED LIVE against the real shared gateway on 2026-09-16: this is a multi-tenant
# Umanah Systems Group box (many unrelated nginx vhosts/docker services already running),
# not a dedicated HUNGREE Goat host — this script only adds files/config for our two
# domains and never touches anything else. It uses a Match-block drop-in under
# sshd_config.d/ (matching this box's existing 10-usg-hardening.conf convention) instead
# of appending to sshd_config directly, and requests the two certs separately (matching
# every other single-domain cert already issued on this box) rather than one combined
# SAN cert. `nginx -t` before `reload` (never `restart`) is what keeps this rerunnable
# without disturbing the unrelated services already listening on this host.
set -euo pipefail
H=$(cd "$(dirname "$0")" && pwd)
id hgtunnel >/dev/null 2>&1 || useradd -r -m -s /usr/sbin/nologin hgtunnel
install -d -m 700 -o hgtunnel -g hgtunnel /home/hgtunnel/.ssh
# key may only open the reverse forward; no shell, no pty, no agent, no X11
( printf 'command="/bin/false",restrict,port-forwarding,permitlisten="127.0.0.1:18090" '; cat "$H/tunnel/hg-tunnel.pub" ) > /home/hgtunnel/.ssh/authorized_keys
chown hgtunnel:hgtunnel /home/hgtunnel/.ssh/authorized_keys; chmod 600 /home/hgtunnel/.ssh/authorized_keys
if [ ! -f /etc/ssh/sshd_config.d/20-hgtunnel.conf ]; then
cat > /etc/ssh/sshd_config.d/20-hgtunnel.conf <<'SSHD'
Match User hgtunnel
    AllowTcpForwarding remote
    GatewayPorts no
    PermitTTY no
    X11Forwarding no
    ForceCommand /bin/false
SSHD
fi
sshd -t && systemctl reload ssh
cp "$H/nginx/api.hungreegoat.com.conf" /etc/nginx/sites-available/api.hungreegoat.com
cp "$H/nginx/control.hungreegoat.com.conf" /etc/nginx/sites-available/control.hungreegoat.com
cp "$H/nginx/dj.hungreegoat.com.conf" /etc/nginx/sites-available/dj.hungreegoat.com
ln -sf /etc/nginx/sites-available/api.hungreegoat.com /etc/nginx/sites-enabled/; ln -sf /etc/nginx/sites-available/control.hungreegoat.com /etc/nginx/sites-enabled/; ln -sf /etc/nginx/sites-available/dj.hungreegoat.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d api.hungreegoat.com --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring || echo "certbot failed for api.hungreegoat.com — check DNS, then rerun"
certbot --nginx -d control.hungreegoat.com --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring || echo "certbot failed for control.hungreegoat.com — check DNS, then rerun"
certbot --nginx -d dj.hungreegoat.com --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring || echo "certbot failed for dj.hungreegoat.com — check DNS, then rerun"
nginx -t && systemctl reload nginx
echo "gateway installed. Tunnel arrives on 127.0.0.1:18090 once the Pi unit connects."
