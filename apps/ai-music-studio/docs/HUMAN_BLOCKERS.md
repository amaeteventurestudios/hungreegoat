# HUMAN_BLOCKERS.md — External Human Actions Only

## Purpose

This file is not a technical-issues list. Technical failures belong in execution plans and handoffs and must be solved autonomously.

Add an item only when a specific external human action is literally impossible for Codex to perform with available permissions and tools.

## Required Proof

Every entry must state:

1. the exact blocked requirement;
2. the exact external human action required;
3. why Codex cannot perform it;
4. safe automation paths already exhausted;
5. relevant commands, endpoints, and errors;
6. official docs/source/issues checked;
7. architecture-preserving alternatives considered;
8. why those alternatives cannot satisfy the requirement; and
9. independent work that continues despite it.

## Explicit Non-Examples

Do not record an API/CLI error, OSS limitation, local-user/token task, version mismatch, migration, component replacement, research need, or technical choice as a human blocker by itself.

## Current Status

Windmill runtime identity is solved technically and is not a blocker. The items below block public HTTPS acceptance, total-host-loss key recovery, and inspection of the separately connected Vercel project; isolated production verification and every other safe Studio task continue independently.

## H14-01 — Privileged access to the shared public gateway

1. **Blocked requirement:** Serve the production Studio at `https://studio.hungreegoat.com` with a valid certificate, secure session cookies, authenticated audio ranges, and no disruption to other Hungree Goat hosts.
2. **Exact external action:** A person or automation identity with authorized nginx/user/Certbot administration on the Hetzner gateway `2.29.28.125` must install the dedicated `hgstudiotunnel` key from `/home/aumanah/.local/share/hg-studio/prod/gateway/studio-tunnel-ed25519.pub`, the Studio-only vhost/certificate in `infra/gateway/`, and reload nginx after `nginx -t`. The prepared runbook is `infra/gateway/README.md`; the existing broadcast tunnel must not be reused.
3. **Why Codex cannot perform it:** The only working SSH identity is `hermes-ro`, whose sudoers permit only `docker ps` and `docker compose ls`; it cannot create the user, write nginx configuration, issue the certificate, or reload nginx. `root@2.29.28.125` rejects the available SSH key (`Permission denied (publickey)`). No authenticated Vercel or DNS control-plane session is available. A Hetzner root-password reset/rescue path changes shared administrative state and may reboot tenants outside the Studio boundary, so it is not an authorized workaround.
4. **Safe paths exhausted:** DNS, TLS, HTTP, enabled nginx sites, gateway account and sudoers, existing tunnels, local Studio ports, repository Vercel configuration, CLI/session availability, and Hetzner control-plane options were inspected. The local Compose project, separate tunnel key, least-privilege key restriction, HTTP ACME bootstrap vhost, HTTPS reverse-proxy vhost, and cert renewal runbook were prepared. Both vhosts pass `nginx -t` against an isolated nginx 1.24 container. Public TLS still fails at the gateway.
5. **Commands/endpoints/errors:** `curl https://studio.hungreegoat.com/` fails `tlsv1 unrecognized name`; `curl http://studio.hungreegoat.com/` gets an empty reply. `ssh hetzner-usg 'sudo -n -l'` lists only Docker read commands. `ssh -o BatchMode=yes root@2.29.28.125 true` returns `Permission denied (publickey)`. `ls /etc/nginx/sites-enabled` contains no Studio host, and `getent passwd hgstudiotunnel` finds no account. `python3 scripts/test-gateway-config.py` passes both templates locally.
6. **Official references checked:** [nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html), [Certbot webroot flow](https://eff-certbot.readthedocs.io/en/stable/using.html#webroot), [Hetzner password reset/rescue](https://docs.hetzner.com/cloud/servers/how-to-rescue/reset-password/), and [Vercel custom-domain setup](https://vercel.com/docs/domains/set-up-custom-domain).
7. **Architecture-preserving alternatives considered:** Deploy on the existing gateway via dedicated SSH tunnel and nginx; use a direct public Studio host port; use the separately connected Vercel project for the Next.js shell; change DNS to another frontend; reuse the broadcast tunnel; use Hetzner reset/rescue.
8. **Why alternatives cannot satisfy safely now:** Direct host exposure lacks DNS/TLS and bypasses the intended gateway; the Vercel Studio build currently fails, lacks an accessible build log/project credential, and cannot reach the private API even if its shell builds; external DNS still points to nginx; DNS changes require an unavailable authenticated DNS control plane; broadcast tunnel reuse weakens isolation; root reset/rescue would affect unrelated tenants. The dedicated nginx route is ready but requires the unavailable privileged gateway operation.
9. **Independent work:** `hg-studio-prod` remains healthy on loopback, real audio/restart smoke, Uptime Kuma, encrypted backups and isolated restore tests, resource/security hardening, full API/browser regressions, documentation, Studio-only commits and pushes continue. After gateway installation, switch monitoring to require public HTTPS and complete browser/TLS/range/broadcast regression before marking Phase 14 done.

## H14-02 — Independent escrow of the backup decryption passphrase

1. **Blocked requirement:** Recover the encrypted off-host Studio backup after total loss of the Studio node, when its local mode-0600 passphrase file would also be lost.
2. **Exact external action:** The owner must place `/home/aumanah/.local/share/hg-studio/prod/backup-passphrase` in a separate owner-controlled secret vault or explicitly designate and authorize a complete secure escrow destination. Never send the value in chat or store it beside the encrypted gateway backup.
3. **Why Codex cannot perform it:** No authorized external secret-vault write identity or owner-selected escrow destination is present. The connected personal Dropbox integration can identify the account, but its upload tool explicitly requires a user request naming the source file and exact destination; broad Studio engineering authorization does not meet that tool-specific condition. Writing the passphrase to the same gateway account as the encrypted archives would collapse encryption and storage boundaries.
4. **Safe paths exhausted:** A 64-character random passphrase was created locally as a mode-0600 file, intentionally excluded from all seven encrypted backup artifacts and the gateway copy. Both PostgreSQL databases and Kuma restore successfully with it while the node is intact. A complete encrypted backup set is already transferred and SHA-256 checked on the separate gateway host. No external vault token, secure destination, or user-authorized Dropbox upload path is available.
5. **Commands/endpoints/errors:** `scripts/backup-studio.py verify --restore-test` passes with the local passphrase. `scripts/offsite-backup.py` reports an eight-file verified remote set, and its idempotent rerun passes. Inspection of environment variable names found no vault/S3 credential; the connected Dropbox `upload_file` contract states an explicit-source-and-destination requirement before any mutation, so no upload was attempted.
6. **Official references checked:** [GnuPG passphrase-file security notes](https://www.gnupg.org/documentation/manuals/gnupg26/gpg.1.html), [NIST key-management survivability](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-57pt1r5.pdf), and [CISA recovery-key storage guidance](https://www.cisa.gov/resources-tools/training/how-protect-data-stored-your-devices).
7. **Architecture-preserving alternatives considered:** Keep the passphrase only locally; copy it beside ciphertext on the gateway; place it in Git; use the connected Dropbox upload integration; use a separate secret vault or offline owner escrow.
8. **Why alternatives cannot satisfy safely now:** Local-only material disappears with the node; gateway co-location or Git would weaken the secret boundary; Dropbox upload is not authorized without an explicit file/destination request; no other authenticated vault exists. Independent owner escrow is the narrow required action.
9. **Independent work:** Encrypted local and off-host copies, checksum verification, daily copy timer, backup-age monitoring, and isolated restore tests operate now. Gateway/public HTTPS work and all remaining Studio-only verification continue regardless of this escrow action.

## H14-03 — Connected Vercel Studio project's private build diagnostics

1. **Blocked requirement:** Determine and repair the failing `hungreegoat-ai-music-studio` Vercel deployment if Vercel delivery remains desired in addition to the canonical Compose/nginx production path.
2. **Exact external action:** An authorized Vercel team member must provide a scoped Vercel token/session or expose the Studio project's build log and Root Directory/Build/Output settings. The required deployment is `dpl_GUr83rdQAxZKNx9z8XgktWfVAghZ` for Studio commit `348c157`.
3. **Why Codex cannot perform it:** The CLI has no login/token, and Vercel's deployment metadata/events API returns HTTP 403. The Vercel dashboard and deployment URL require account SSO. Existing GitHub SSH access does not grant Vercel project access.
4. **Safe paths exhausted:** Fetched origin and verified commit `348c157` on GitHub; inspected public GitHub commit statuses and deployment statuses, this checkout's Vercel files/session names, unauthenticated Vercel dashboard/deployment/REST endpoints, and ran the exact `npx vercel inspect ... --logs` diagnostic. Local `npm run build`, typecheck, lint, production Docker build, and loopback-routed production-origin browser smoke all pass; the Studio Vercel status failed across multiple earlier commits as well.
5. **Commands/endpoints/errors:** GitHub reports `Vercel – hungreegoat-ai-music-studio: failure` with “Deployment has failed — run ... inspect ... --logs.” `CI=1 npx --yes vercel inspect dpl_GUr83rdQAxZKNx9z8XgktWfVAghZ --logs` returns `No existing credentials found`. `https://api.vercel.com/v13/deployments/dpl_GUr83rdQAxZKNx9z8XgktWfVAghZ` and the events endpoint both return 403. The deployment URL redirects to Vercel SSO.
6. **Official references checked:** [Vercel monorepo Root Directory guidance](https://vercel.com/docs/monorepos), [Vercel build/output configuration](https://vercel.com/docs/builds/configure-a-build), and [Vercel custom-domain/DNS setup](https://vercel.com/docs/domains/set-up-custom-domain).
7. **Architecture-preserving alternatives considered:** Blindly add a Studio `vercel.json`, move app roots, use Vercel only as a frontend, expose the API publicly, or keep the tested isolated Compose/nginx path.
8. **Why alternatives cannot satisfy this Vercel-specific request safely now:** Without project Root Directory/build logs, a `vercel.json` could be ignored or misconfigure other monorepo deployments. A Vercel frontend cannot access the currently private Studio API, and publishing that API requires the same unavailable gateway/DNS authority. The Compose/nginx path preserves full product/security contracts and is the canonical launch implementation, but it does not make the extra Vercel project green.
9. **Independent work:** Continue isolated Studio hardening, source tests, local production/browser verification, backup/restore, off-host encrypted copy, and public gateway preparation. This Vercel status does not justify weakening API exposure or altering sibling Vercel projects.
