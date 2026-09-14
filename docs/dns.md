# DNS map (intended — do not change records until each target is verified)
| Host | Target | Notes |
|---|---|---|
| `hungreegoat.com` | Vercel (`apps/website`) — A 76.76.21.21 or Vercel-provided | currently points at the legacy host 192.250.227.21 (hostcrane) |
| `www.hungreegoat.com` | CNAME `cname.vercel-dns.com` | Vercel redirects www → apex |
| `player.hungreegoat.com` | CNAME `cname.vercel-dns.com` (`apps/player`) | |
| `dashboard.hungreegoat.com` | A 65.21.7.133 (Hetzner gateway) | private, TLS + operator login |
| `api.hungreegoat.com` | A 65.21.7.133 (Hetzner gateway) | public read-only `/v1/*` only |
Nameservers: ns1/ns2.hostcrane.com. Cut-over order: gateway (api → verify `/v1/live`) → player → homepage → www.
