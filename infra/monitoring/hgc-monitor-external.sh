#!/usr/bin/env bash
# HUNGREE Goat — PRIMARY EXTERNAL monitor. Runs on the Hetzner gateway (hetzner-usg) as the
# restricted hermes-ro user via cron (no root, no sudo needed — this only does outbound HTTP).
# Independent of the broadcast pipeline by design: this box has no relationship to Liquidsoap/
# FFmpeg/HGC other than being outside the house, so it can still alert when the whole home
# network (Beelink, router, ISP, power) goes dark — something nothing INSIDE the house can do.
#
# Checks the same public URLs a real visitor/listener would hit. A push notification only
# tells a human something useful if it doesn't also fire for every blip, so state is tracked
# in STATE_FILE to: alert once per new incident, remind every $COOLDOWN_SEC while still down,
# and always send an explicit recovery notification with outage duration (never silent).
set -u
NTFY_TOPIC_FILE="$HOME/.hgc-ntfy-topic"
STATE_FILE="$HOME/.hgc-monitor-state-external"
COOLDOWN_SEC=900   # re-remind at most every 15 min while an incident is ongoing
LABEL="External-Hetzner"

[ -f "$NTFY_TOPIC_FILE" ] || { echo "missing $NTFY_TOPIC_FILE — monitor not configured" >&2; exit 1; }
TOPIC=$(cat "$NTFY_TOPIC_FILE")

notify() {
    # $1=title $2=body $3=priority(urgent|high|default)
    curl -fsS -m 10 \
        -H "Title: $1" -H "Priority: ${3:-default}" -H "Tags: hungree-goat" \
        -d "$2" "https://ntfy.sh/$TOPIC" >/dev/null 2>&1
}

check() { curl -fsS -m 8 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null; }

reasons=""
ok=1

code=$(check "https://api.hungreegoat.com/v1/health/broadcast")
if [ "$code" = "200" ]; then
    body=$(curl -fsS -m 8 "https://api.hungreegoat.com/v1/health/broadcast" 2>/dev/null)
    status=$(printf '%s' "$body" | grep -o '"status": *"[a-z]*"' | head -1 | cut -d'"' -f4)
    case "$status" in
        healthy) : ;;
        "" ) ok=0; reasons="$reasons; broadcast health endpoint returned an unreadable body" ;;
        * ) ok=0; reasons="$reasons; broadcast health = $status" ;;
    esac
else
    ok=0; reasons="$reasons; api.hungreegoat.com/v1/health/broadcast -> HTTP ${code:-timeout}"
fi

for url in "https://control.hungreegoat.com/" "https://player.hungreegoat.com/" "https://hungreegoat.com/"; do
    code=$(check "$url")
    case "$code" in
        2*|3*) : ;;
        *) ok=0; reasons="$reasons; $url -> HTTP ${code:-timeout}" ;;
    esac
done

now=$(date +%s)
prev_status="unknown"; prev_first_bad=0; prev_last_alert=0
[ -f "$STATE_FILE" ] && read -r prev_status prev_first_bad prev_last_alert < "$STATE_FILE"

if [ "$ok" = "1" ]; then
    if [ "$prev_status" = "bad" ]; then
        dur=$((now - prev_first_bad))
        notify "HUNGREE Goat RECOVERED [$LABEL]" "Public services reachable again. Outage duration: $((dur/60))m $((dur%60))s." "high"
    fi
    printf 'good %s %s\n' "$now" "$now" > "$STATE_FILE"
else
    reasons=${reasons#; }
    if [ "$prev_status" != "bad" ]; then
        notify "HUNGREE Goat OUTAGE [$LABEL]" "$reasons" "urgent"
        printf 'bad %s %s\n' "$now" "$now" > "$STATE_FILE"
    elif [ $((now - prev_last_alert)) -ge "$COOLDOWN_SEC" ]; then
        dur=$((now - prev_first_bad))
        notify "HUNGREE Goat STILL DOWN [$LABEL]" "$((dur/60))m elapsed. $reasons" "urgent"
        printf 'bad %s %s\n' "$prev_first_bad" "$now" > "$STATE_FILE"
    fi
fi
