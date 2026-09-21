#!/usr/bin/env bash
# HUNGREE Goat — SECONDARY LOCAL monitor. Runs on pi-node-01 via cron, as the pi's own user —
# does not touch the existing Uptime Kuma install at all (separate script, separate topic-less
# ntfy call, no shared state, no shared credentials).
#
# Purpose: distinguish "the whole house is dark" from "just the public gateway/tunnel/ISP path
# is broken" — this checks Beelink directly over the LAN (bypassing api.hungreegoat.com
# entirely), so if this succeeds while the external Hetzner monitor reports an outage, that's
# real evidence the problem is the gateway/tunnel/ISP egress, not Beelink or home power. If
# this ALSO fails, that's real evidence pointing at Beelink/LAN/home power instead. Neither
# monitor "decides" the root cause on its own — a human reading both alert labels does — but
# each one only ever reports what it actually observed (see the evidence framework in
# docs/monitoring-alerts.md), never invents a shared root cause it can't prove alone.
set -u
NTFY_TOPIC_FILE="$HOME/.hgc-ntfy-topic"
STATE_FILE="$HOME/.hgc-monitor-state-local"
COOLDOWN_SEC=900
LABEL="Local-Pi"
BEELINK_LAN="192.168.6.233"

[ -f "$NTFY_TOPIC_FILE" ] || { echo "missing $NTFY_TOPIC_FILE — monitor not configured" >&2; exit 1; }
TOPIC=$(cat "$NTFY_TOPIC_FILE")

notify() {
    curl -fsS -m 10 \
        -H "Title: $1" -H "Priority: ${3:-default}" -H "Tags: hungree-goat" \
        -d "$2" "https://ntfy.sh/$TOPIC" >/dev/null 2>&1
}

ok=1
reasons=""

if ! ping -c1 -W2 "$BEELINK_LAN" >/dev/null 2>&1; then
    ok=0; reasons="Beelink ($BEELINK_LAN) does not answer ping on the LAN"
else
    body=$(curl -fsS -m 8 "http://$BEELINK_LAN:8090/v1/health/broadcast" 2>/dev/null)
    if [ -z "$body" ]; then
        ok=0; reasons="Beelink answers ping but the local HGC API did not respond"
    else
        status=$(printf '%s' "$body" | grep -o '"status": *"[a-z]*"' | head -1 | cut -d'"' -f4)
        case "$status" in
            healthy) : ;;
            "") ok=0; reasons="local health endpoint returned an unreadable body" ;;
            *) ok=0; reasons="local broadcast health = $status" ;;
        esac
    fi
fi

now=$(date +%s)
prev_status="unknown"; prev_first_bad=0; prev_last_alert=0
[ -f "$STATE_FILE" ] && read -r prev_status prev_first_bad prev_last_alert < "$STATE_FILE"

if [ "$ok" = "1" ]; then
    if [ "$prev_status" = "bad" ]; then
        dur=$((now - prev_first_bad))
        notify "HUNGREE Goat RECOVERED [$LABEL]" "Beelink reachable and healthy on the LAN again. Outage duration: $((dur/60))m $((dur%60))s." "high"
    fi
    printf 'good %s %s\n' "$now" "$now" > "$STATE_FILE"
else
    if [ "$prev_status" != "bad" ]; then
        notify "HUNGREE Goat LOCAL ISSUE [$LABEL]" "$reasons. If the external monitor also reports an outage, this points at Beelink/home power/LAN rather than just the public gateway." "urgent"
        printf 'bad %s %s\n' "$now" "$now" > "$STATE_FILE"
    elif [ $((now - prev_last_alert)) -ge "$COOLDOWN_SEC" ]; then
        dur=$((now - prev_first_bad))
        notify "HUNGREE Goat STILL DOWN [$LABEL]" "$((dur/60))m elapsed. $reasons" "urgent"
        printf 'bad %s %s\n' "$prev_first_bad" "$now" > "$STATE_FILE"
    fi
fi
