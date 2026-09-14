# Local development
- Public apps: `HG_API_BASE=http://<pi-lan-ip>:8090 node packages/shared/build.mjs website` then serve `apps/website/dist`
  (e.g. `python3 -m http.server 4173`). Same for `player` (port 4174; set `HG_HOME_URL`/`HG_PLAYER_URL` to the local ports).
- Control: `cd apps/control && python3 -m venv venv && venv/bin/pip install -r requirements.txt && HGC_HOME=$PWD/.dev HGC_MEDIA=/path/to/media venv/bin/python -m hgc serve`.
- Browser tests used during development: puppeteer-core against the installed Chrome (see git history of the build session);
  test at 360/390/430/768/1024/1440 with zero console errors and no horizontal overflow.
