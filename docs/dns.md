# DNS map (intended — do not change records until each target is verified)
| Host | Target | Notes |
|---|---|---|
| `hungreegoat.com` | Vercel (`apps/website`) — A 76.76.21.21 or Vercel-provided | currently points at the legacy host 192.250.227.21 (hostcrane) |
| `www.hungreegoat.com` | CNAME `cname.vercel-dns.com` | Vercel redirects www → apex |
| `player.hungreegoat.com` | CNAME `cname.vercel-dns.com` (`apps/player`) | |
| `control.hungreegoat.com` | A 2.29.28.125 (shared gateway, hostname `hetzner-usg`) | private, TLS + operator login — **LIVE**, verified 2026-09-16 |
| `api.hungreegoat.com` | A 2.29.28.125 (shared gateway, hostname `hetzner-usg`) | public read-only `/v1/*` only — **LIVE**, verified 2026-09-16 |
Nameservers: ns1/ns2.hostcrane.com.

## Gateway live 2026-09-16
Both domains are fully working end to end: `hgtunnel` account created on the gateway (restricted key —
`command="/bin/false",restrict,port-forwarding,permitlisten="127.0.0.1:18090"` — plus a
`Match User hgtunnel` block in `sshd_config.d/20-hgtunnel.conf`), the Pi's reverse tunnel
(`hungree-goat-tunnel.service`) connects and stays up, and `certbot --nginx` issued separate
certificates for each domain (both auto-renew via the gateway's existing shared `certbot.timer`).
Verified with real traffic: `https://api.hungreegoat.com/v1/tracks` returns the real 140-track catalog
and real track audio (206 Partial Content, real MPEG bytes); `https://control.hungreegoat.com` serves
real authenticated Control pages over a secure context.

The gateway (`hetzner-usg`) is a **shared, multi-tenant Umanah Systems Group box** running many
unrelated services (nginx vhosts for Stravour/EspoCRM/Vikunja/Documenso/etc., Authentik SSO, several
Docker containers) — HUNGREE Goat's nginx sites and the `hgtunnel` user were added without touching any
of those; `nginx -t` was checked before every `reload` (never `restart`) for exactly this reason.

## Audit 2026-09-15 (second pass, from the Pi)
`api.hungreegoat.com` and `control.hungreegoat.com` both now resolve to `2.29.28.125`; the old gateway
`65.21.7.133` refuses TCP connections entirely (confirmed dead, not just slow). The reverse tunnel unit
and the gateway install script were repointed at `2.29.28.125` and renamed `dashboard.` → `control.`
throughout. (Resolved 2026-09-16 — see above.)

## Audit 2026-09-15 (authoritative zone at ns1/ns2.mysecurecloudhost.com — 13.248.158.180 / 75.2.118.134)
| Host | Found | Serving |
|---|---|---|
| `hungreegoat.com` | A 216.198.79.1 (Vercel), no AAAA | HTTPS 200, Let's Encrypt cert by Vercel, no proxy in front |
| `www.hungreegoat.com` | **no record** | does not resolve — add `CNAME www → cname.vercel-dns.com` (or the project target) and add `www.hungreegoat.com` to the Vercel website project (redirect to apex) |
| `player.hungreegoat.com` | CNAME 04e541c80e1bebc1.vercel-dns-017.com | HTTPS 200, valid cert |
| `api.` / `dashboard.` | no record | expected until the gateway is installed |

Delegation inconsistency: the .com registry publishes `ns1/ns2.hostcrane.com` (hostnames that do not resolve publicly — resolution works only through registry glue) while the registrar (Namecheap, updated 2026-09-14) lists `ns1–4.mysecurecloudhost.com`, and the zone's own NS/SOA still say hostcrane. Resolvers cope, but automated checkers (e.g. Vercel's "proxy in front of this domain" probe) can fail on it — that is the likely source of the cosmetic "Proxy Status Unknown". Fix at the host/registrar: make the zone's NS records and the registry delegation agree (mysecurecloudhost). No DNS was changed by this audit.
