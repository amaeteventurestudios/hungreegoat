# Disaster recovery

**Question this document answers:** if the current server dies, how do I rebuild HUNGREE
Goat?

No secret values appear in this document. It tells you *what* you need and *where it comes
from* — never the values themselves.

## What you need

1. **This GitHub repository** — `git@github.com:amaeteventurestudios/hungreegoat.git`
   (source code, deployment scripts, documentation — everything that belongs in Git).
2. **A private backup of everything that does not belong in Git**, taken from the live
   host, covering:
   - `~/hungree-goat/secrets/` — stream keys, operator credentials, the session-signing
     key, the internal callback token. Mode 600/0700; treat this backup itself as sensitive.
   - `~/hungree-goat/data/hungree-goat.sqlite3*` — the database: track catalog, play
     history, schedules, settings, alerts/events.
   - `/media/hungree-goat/` — your actual music library, artwork, broadcast-visual clips,
     fallback/jingle audio, and playlists.
   - (Optional but useful) `~/hungree-goat/logs/` — historical logs, not required for a
     working restore.
3. **A Linux host** meeting the requirements in the root `README.md` (Docker, Git, ideally
   hardware video encoding).

GitHub alone is **not** enough — it has none of the above. The private backup alone is also
not enough — it has no application code. You need both.

## Restore order

1. Provision the new host (fresh Ubuntu/Debian recommended), install Docker + Git.
2. Clone this repository.
3. Build the image from `infra/beelink/Dockerfile` (see the root README's "Installing
   HUNGREE Goat on a New Computer" for the exact commands).
4. Lay out `~/hungree-goat/{app,secrets,run,logs,data,bin}/` and copy `apps/control/hgc` +
   `apps/control/static` into `~/hungree-goat/app/`.
5. **Restore secrets** into `~/hungree-goat/secrets/` from your private backup (item 2
   above) — mode 700 on the directory, 600 on the files. Do this *before* first start; the
   app will otherwise generate a fresh operator account and you'll need to reconcile the two.
6. **Restore the database** into `~/hungree-goat/data/` from your private backup.
7. **Mount or restore your music library** at `/media/hungree-goat/` (or point `HGC_MEDIA`
   at wherever you restored it).
8. Install the systemd units (`infra/beelink/systemd/*.service`) and start them —
   `hungree-goat-control` first, then `hungree-goat-liquidsoap@<station>` and
   `hungree-goat-stream@<station>` for each station you run.
9. If you use the public gateway setup (`infra/gateway/`): re-establish the reverse tunnel
   (new host needs its own tunnel key authorized on the gateway — see `docs/dns.md` and
   `infra/gateway/`) and update DNS if the new host's tunnel identity changed.
10. Reconfigure YouTube stream keys from the Control dashboard's YouTube Setup page if they
    weren't part of your secrets backup (or if you're rotating them as part of this
    recovery — see the note below).

## Verification checklist

Work through this in order; each step should be true before moving to the next.

- [ ] `systemctl --user status hungree-goat-control` — active, and `http://<host>:8090`
      loads the login page.
- [ ] You can sign in with your restored operator credentials.
- [ ] The Library page shows your restored track catalog (from the database restore).
- [ ] `systemctl --user status hungree-goat-liquidsoap@<station>` — active for each station.
- [ ] The Dashboard's Now Playing reflects real, advancing playback (not stuck).
- [ ] `systemctl --user status hungree-goat-stream@<station>` — active.
- [ ] The YouTube Setup page's Pipeline Health shows "Sending to YouTube" as OK (if you use
      YouTube broadcasting) — remember this only confirms the local encoder is sending, not
      that YouTube has verified receipt (see the root README's YouTube Streaming section).
- [ ] If you use the public gateway: `https://api.<domain>/v1/live` and
      `https://control.<domain>` both resolve and respond.

## If a secret was compromised as part of whatever caused the recovery

Rotate it — don't just restore the old one:
- YouTube stream key: generate a new one in YouTube Studio and set it from the Control
  dashboard's YouTube Setup page (this also invalidates the old one).
- Operator password: change it from Settings once you're signed in.
- Session-signing key / internal callback token: these are regenerated automatically by the
  backend if you don't restore them from backup — deleting the old ones (rather than
  restoring them) forces fresh ones on next start, which is the simplest rotation path for
  those two specifically.

## Open-source readiness (secret and history audit, current as of the commit that added this file)

A full audit (tracked files, working tree, and the *entire* git history — not just the
current checkout, since `.gitignore` alone doesn't prove history is clean) was run before
this repository was pointed at a real GitHub remote:

- Checked for real-secret-shaped patterns (AWS keys, Google API keys, GitHub tokens, Stripe
  live keys, Slack tokens, Tailscale auth keys, PEM/SSH private-key headers, and generic
  hardcoded `password=`/`secret=`/`*_key=` assignments) across every tracked file's current
  content **and** every commit in the full history (`git log --all -p`, not just `HEAD`).
  **Result: clean.** No matches beyond legitimate placeholder/example files.
- Checked whether any secret-shaped file was ever committed and later deleted (which would
  still leave it recoverable from history even after removal). **Result: none found.**
- The only tracked files with secret-sounding names are genuine, placeholder-only templates:
  `apps/control/secrets.example.md`, `apps/player/.env.example`,
  `infra/pi/youtube.env.example`, and brand `tokens.css` files (color tokens, not
  credentials) — all read and confirmed to contain no real values.
- `.gitignore` was reviewed against the actual live secret/runtime paths on the production
  host and found already correct: `secrets/`, `*.env`, `operator.json`,
  `operator-password.txt`, `*.key`/`*.pem`/`*.crt`/`*.token`, `logs/`, `run/`, `data/`,
  `*.sqlite3*`.

**Before making this repository public, a full licensing audit was run** (root `LICENSE`,
component `LICENSE`/`NOTICE` files, package manifests, vendored source headers) — see
`THIRD_PARTY_NOTICES.md` for the complete component-by-component breakdown. Summary:

- Root `LICENSE` now correctly attributes original HUNGREE Goat code to its actual creator
  (`Copyright © 2023–2026 Amaete Umanah`) and explicitly excludes the components below,
  rather than silently claiming "all rights reserved" over code it doesn't own.
- **`apps/player`** is AGPL-3.0 (derivative of a third-party project, copyright Gilles
  Momeni). Re-checked whether AGPL's copyleft extends into the rest of the monorepo, more
  rigorously this pass — `apps/player` has: zero source-level imports of any other package
  in this repo (`packages/shared`, `packages/ui`, etc.); zero relative imports reaching
  outside its own directory at all (`grep` for `../../..`-style imports across
  `apps/player/src`: no matches); its own independent, self-written API client
  (`src/lib/api.ts`) rather than the `packages/shared/hg-api.js` that `apps/website` uses
  (confirmed `hg-api.js` is referenced only by `apps/website`, never `apps/player`); its own
  independent Vite build with no path aliases pointing outside itself
  (`apps/player/vite.config.ts`); and deploys as a fully separate Vercel project. Its only
  connection to the rest of HUNGREE Goat is a plain HTTP/REST call at runtime
  (`fetch`, `/v1/*`) — that's "mere aggregation via a network interface," not a combined or
  derivative work, under the FSF's own guidance on AGPL §13. This is a legal reading, not a
  certainty; get your own legal review before relying on it, especially before any public
  release.
- **`apps/dj-studio`** bundles two upstream projects rather than reimplementing DSP:
  Aurdour (MIT, the DJ engine) and noisyloop/mastering (ISC, the mastering DSP, itself
  vendoring one MIT file from npm `fft.js`). All three require their own copyright/license
  notice to be preserved, not replaced with HUNGREE Goat's own — done correctly today (see
  `apps/dj-studio/LICENSE.aurdour`, `vendor/mastering-dsp/LICENSE.mastering`); HUNGREE
  Goat's own contribution there is credited separately in `apps/dj-studio/NOTICE.md`
  without touching upstream's copyright line. The Python-side integration
  (`hgc/dj_orchestrator.py`) drives this MIT/ISC code by launching a headless browser
  against its static pages (Playwright), not by importing or copying its source into
  `apps/control`'s own Python code — a process-level, not code-level, relationship.
- **Fixed this pass**: the bundled fonts (Montserrat, Inter, Great Vibes —
  `packages/brand/fonts/`) — confirmed SIL OFL 1.1 directly from each font file's own
  embedded metadata (not the filename), with real upstream project URLs and copyright
  years. Added the actual OFL 1.1 license text (`packages/brand/fonts/OFL-*.txt`, fetched
  from each project's own repository) alongside them, and updated `THIRD_PARTY_NOTICES.md`.
- **New finding, unresolved**: `apps/player/public/assets/ambience/*.mp3` (15 ambient sound
  loops, part of the player's built-in ambient-mixer feature) are confirmed byte-for-byte
  identical to files in the upstream `menoc61/lofi-music-website` repo (verified by MD5, not
  assumed) — but that upstream repo never documents where *it* sourced this audio from, and
  has an internal inconsistency of its own (a "License: MIT" README badge next to an
  actual AGPL-3.0 `LICENSE` file). A code license bundling audio doesn't by itself establish
  redistribution rights to that audio. See `THIRD_PARTY_NOTICES.md` for the full writeup and
  recommendation — not resolved, not deleted, flagged for a decision before public release.
- **Root license type is still undecided** — original HUNGREE Goat code stays proprietary
  for now; a plain-English comparison of the realistic open-source options (MIT, Apache-2.0,
  GPL-family, AGPL) was presented separately for a deliberate decision, not applied
  automatically. Whatever is chosen only needs to be compatible with what it *depends on*
  (this repo doesn't statically link AGPL/GPL code into original HUNGREE Goat code — the
  vendored components above are either separately-deployed (`apps/player`) or MIT/ISC
  (`apps/dj-studio`'s vendored DSP), so compatibility is a smaller concern than it would be
  if AGPL code were compiled directly into the backend).

A full internal-IP/hostname scan (every tracked file, not just the ones previously spotted)
was run this pass. Classified findings, worst first:

- **`docs/dns.md`, as a whole file, is the standout concern.** It reads as a private DNS/
  gateway operations log (timestamped audits, registrar/nameserver troubleshooting) rather
  than public documentation, and — more importantly — it names **other, unrelated
  third-party services and products** that happen to share the same gateway host
  (by name, in the file). That's not HUNGREE Goat's information to publish. Recommend this
  file stay private, or be replaced with a short, genuinely generic "how DNS/the gateway
  routing works" doc for any public release — not generalized in this pass; see the chat
  report for the specifics before deciding.
- The gateway's real public IP appears in several other places, split between two kinds:
  operational config that must keep the real value to function
  (`infra/beelink/systemd/hungree-goat-tunnel.service`,
  `infra/gateway/tunnel/hungree-goat-tunnel.service`, `infra/gateway/install-hetzner.sh`) —
  left untouched, per instruction not to alter operational configuration — versus prose in
  `docs/deployment.md` that could reasonably be marked "this deployment's real value, replace
  with your own gateway" without breaking anything.
- `infra/pi/deploy.sh` and `infra/pi/RUNBOOK.md` hardcode the Pi's LAN IP
  (`192.168.6.235`) — low sensitivity (a private LAN address, useless to an outsider), but
  reveals real topology; same "prose vs. operational config" split as above.
- Public hostnames (`hungreegoat.com`, `player.hungreegoat.com`, `api.hungreegoat.com`,
  `control.hungreegoat.com`) and the DNS targets Vercel itself publishes for anyone to use
  (e.g. `76.76.21.21`, `cname.vercel-dns.com`) are legitimately public and fine to keep as-is
  — they're either HUNGREE Goat's own public product surface or a platform's own published
  target, not something to genericize.

No file was changed for any of the above in this pass — classification only, so specific
replacements can be reviewed before they're made.
