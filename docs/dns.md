# DNS map (intended — do not change records until each target is verified)
| Host | Target | Notes |
|---|---|---|
| `hungreegoat.com` | Vercel (`apps/website`) — A 76.76.21.21 or Vercel-provided | currently points at the legacy host 192.250.227.21 (hostcrane) |
| `www.hungreegoat.com` | CNAME `cname.vercel-dns.com` | Vercel redirects www → apex |
| `player.hungreegoat.com` | CNAME `cname.vercel-dns.com` (`apps/player`) | |
| `control.hungreegoat.com` | A 2.29.28.125 (Hetzner gateway) | private, TLS + operator login (renamed from `dashboard.`; old gateway 65.21.7.133 is dead) |
| `api.hungreegoat.com` | A 2.29.28.125 (Hetzner gateway) | public read-only `/v1/*` only |
Nameservers: ns1/ns2.hostcrane.com. Cut-over order: gateway (api → verify `/v1/live`) → player → homepage → www.

## Audit 2026-09-15 (second pass, from the Pi)
`api.hungreegoat.com` and `control.hungreegoat.com` both now resolve to `2.29.28.125`; the old gateway
`65.21.7.133` refuses TCP connections entirely (confirmed dead, not just slow). The reverse tunnel unit
(`infra/gateway/tunnel/hungree-goat-tunnel.service`) and the gateway install script have been repointed at
`2.29.28.125` and renamed `dashboard.` → `control.` throughout. **Outstanding:** the Pi's existing tunnel
key (`infra/gateway/tunnel/hg-tunnel.pub`) must be authorized on the *new* gateway by re-running
`infra/gateway/install-hetzner.sh` there (or manually adding it under the `hgtunnel` user) — this could not
be done from here and needs an operator with root on 2.29.28.125.

## Audit 2026-09-15 (authoritative zone at ns1/ns2.mysecurecloudhost.com — 13.248.158.180 / 75.2.118.134)
| Host | Found | Serving |
|---|---|---|
| `hungreegoat.com` | A 216.198.79.1 (Vercel), no AAAA | HTTPS 200, Let's Encrypt cert by Vercel, no proxy in front |
| `www.hungreegoat.com` | **no record** | does not resolve — add `CNAME www → cname.vercel-dns.com` (or the project target) and add `www.hungreegoat.com` to the Vercel website project (redirect to apex) |
| `player.hungreegoat.com` | CNAME 04e541c80e1bebc1.vercel-dns-017.com | HTTPS 200, valid cert |
| `api.` / `dashboard.` | no record | expected until the gateway is installed |

Delegation inconsistency: the .com registry publishes `ns1/ns2.hostcrane.com` (hostnames that do not resolve publicly — resolution works only through registry glue) while the registrar (Namecheap, updated 2026-09-14) lists `ns1–4.mysecurecloudhost.com`, and the zone's own NS/SOA still say hostcrane. Resolvers cope, but automated checkers (e.g. Vercel's "proxy in front of this domain" probe) can fail on it — that is the likely source of the cosmetic "Proxy Status Unknown". Fix at the host/registrar: make the zone's NS records and the registry delegation agree (mysecurecloudhost). No DNS was changed by this audit.
