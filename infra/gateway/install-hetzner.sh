#!/bin/bash
# Run as root ON THE HETZNER GATEWAY (65.21.7.133). Creates the restricted tunnel user, installs the nginx sites
# and requests certificates. Requires: the Pi's tunnel public key (infra/gateway/tunnel/hg-tunnel.pub) and DNS A records
# for api.hungreegoat.com and dashboard.hungreegoat.com pointing at this server.
set -euo pipefail
H=$(cd "$(dirname "$0")" && pwd)
id hgtunnel >/dev/null 2>&1 || useradd -r -m -s /usr/sbin/nologin hgtunnel
install -d -m 700 -o hgtunnel -g hgtunnel /home/hgtunnel/.ssh
# key may only open the reverse forward; no shell, no pty, no agent, no X11
( printf 'command="/bin/false",restrict,port-forwarding,permitlisten="127.0.0.1:18090" '; cat "$H/tunnel/hg-tunnel.pub" ) > /home/hgtunnel/.ssh/authorized_keys
chown hgtunnel:hgtunnel /home/hgtunnel/.ssh/authorized_keys; chmod 600 /home/hgtunnel/.ssh/authorized_keys
grep -q "^Match User hgtunnel" /etc/ssh/sshd_config || cat >> /etc/ssh/sshd_config <<'SSHD'

Match User hgtunnel
    AllowTcpForwarding remote
    GatewayPorts no
    PermitTTY no
    X11Forwarding no
    ForceCommand /bin/false
SSHD
sshd -t && systemctl reload ssh
mkdir -p /var/cache/nginx/hgapi
cp "$H/nginx/api.hungreegoat.com.conf" /etc/nginx/sites-available/api.hungreegoat.com
cp "$H/nginx/dashboard.hungreegoat.com.conf" /etc/nginx/sites-available/dashboard.hungreegoat.com
ln -sf /etc/nginx/sites-available/api.hungreegoat.com /etc/nginx/sites-enabled/; ln -sf /etc/nginx/sites-available/dashboard.hungreegoat.com /etc/nginx/sites-enabled/
certbot --nginx -d api.hungreegoat.com -d dashboard.hungreegoat.com --non-interactive --agree-tos --keep-until-expiring -m "${CERT_EMAIL:-amaete@umanahsystems.com}" || echo "certbot failed — check DNS, then rerun"
nginx -t && systemctl reload nginx
echo "gateway installed. Tunnel arrives on 127.0.0.1:18090 once the Pi unit connects."
