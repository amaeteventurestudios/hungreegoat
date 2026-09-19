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

**Before making this repository public, still resolve the licensing question** described in
the root README's License section: the top-level `LICENSE` currently says "all rights
reserved," while `apps/player` is separately AGPL-3.0 and `apps/dj-studio`'s DJ engine is
MIT-derived. That's a real inconsistency to decide on deliberately (e.g. dual-license the
monorepo explicitly, or carve those subtrees out) — not something this audit can resolve on
its own, and not something to guess at.

Other things worth a look before a public release, not secrets but still worth generalizing
or flagging:
- `infra/pi/deploy.sh` and a few docs hardcode the operator's LAN IP for the Pi
  (`192.168.6.235`) and the gateway's public IP — fine for private-repo internal docs, worth
  reconsidering if this goes public (an internal LAN IP isn't very sensitive, but it's also
  not useful to a stranger and reveals real infrastructure topology).
- `infra/gateway/` and `docs/dns.md` reference real production hostnames
  (`hungreegoat.com`, `control.hungreegoat.com`, etc.) — expected and fine to keep; a
  template/example deployment might want these called out as "replace with your own domain"
  more explicitly than they are today.
