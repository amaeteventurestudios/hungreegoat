#!/bin/bash
# HungreeGoat outside check (added 2026-11-14): every minute, test the API and control panel.
# Alerts only after 3 failures in a row, once, and says when it recovers. Alerts go to the journal
# (journalctl -t hg-healthcheck) and, if /etc/hg-healthcheck/notify exists and is executable, to that script.
STATE=/var/lib/hg-healthcheck; mkdir -p $STATE
notify(){ logger -t hg-healthcheck "$1"; [ -x /etc/hg-healthcheck/notify ] && /etc/hg-healthcheck/notify "$1" || true; }
for url in https://api.hungreegoat.com/v1/stations https://control.hungreegoat.com/; do
  key=$(echo "$url" | md5sum | cut -c1-8); f=$STATE/$key
  code=$(curl -s -m10 -o /dev/null -w "%{http_code}" "$url")
  n=$(cat $f 2>/dev/null || echo 0)
  if [ "$code" = 200 ]; then
    [ "$n" -ge 3 ] && notify "RECOVERED: $url is answering again"
    echo 0 > $f
  else
    n=$((n+1)); echo $n > $f
    [ "$n" = 3 ] && notify "DOWN: $url failed 3 checks in a row (last answer: $code)"
  fi
done
