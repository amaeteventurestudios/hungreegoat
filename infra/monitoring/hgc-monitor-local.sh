#!/usr/bin/env bash
# HUNGREE Goat — SECONDARY LOCAL monitor. Runs on pi-node-01 via cron, as the pi's own user —
# does not touch the existing Uptime Kuma install at all (separate script, separate topic-less
# ntfy call, no shared state, no shared credentials).
#
# Purpose: distinguish "the whole house is dark" from "just the public gateway/tunnel/ISP path
# is broken". The Pi has its OWN internet connection, independent of Beelink's LAN — so this
# script checks BOTH perspectives in one run (LAN-direct to Beelink, and the same public
# endpoint the external monitor checks) and correlates them itself, rather than requiring a
# human to compare two separate alerts (see docs/monitoring-alerts.md Part 10). It never
# claims a root cause it can't prove from its own two observations — only what it actually
# saw, phrased as evidence.
set -u
NTFY_TOPIC_FILE="$HOME/.hgc-ntfy-topic"
STATE_FILE="$HOME/.hgc-monitor-state-local"
COOLDOWN_SEC=900
LABEL="Local-Pi"
BEELINK_LAN="192.168.4.41"
PUBLIC_HEALTH_URL="https://api.hungreegoat.com/v1/health/broadcast"

[ -f "$NTFY_TOPIC_FILE" ] || { echo "missing $NTFY_TOPIC_FILE — monitor not configured" >&2; exit 1; }
TOPIC=$(cat "$NTFY_TOPIC_FILE")

notify() {
    curl -fsS -m 10 \
        -H "Title: $1" -H "Priority: ${3:-default}" -H "Tags: hungree-goat" \
        -d "$2" "https://ntfy.sh/$TOPIC" >/dev/null 2>&1
}

lan_ok=1; lan_reason=""
if ! ping -c1 -W2 "$BEELINK_LAN" >/dev/null 2>&1; then
    lan_ok=0; lan_reason="Beelink ($BEELINK_LAN) does not answer ping on the LAN"
else
    body=$(curl -fsS -m 8 "http://$BEELINK_LAN:8090/v1/health/broadcast" 2>/dev/null)
    if [ -z "$body" ]; then
        lan_ok=0; lan_reason="Beelink answers ping but the local HGC API did not respond"
    else
        status=$(printf '%s' "$body" | grep -o '"status": *"[a-z]*"' | head -1 | cut -d'"' -f4)
        case "$status" in
            healthy) : ;;
            "") lan_ok=0; lan_reason="local health endpoint returned an unreadable body" ;;
            *) lan_ok=0; lan_reason="local broadcast health = $status" ;;
        esac
    fi
fi

pub_code=$(curl -fsS -m 8 -o /dev/null -w '%{http_code}' "$PUBLIC_HEALTH_URL" 2>/dev/null)
pub_ok=0
[ "$pub_code" = "200" ] && pub_ok=1

# Correlate the two perspectives from this single run — this is the automated correlation
# Part 10 asks for, done the only way that's honest without a shared backend between hosts:
# one script, two independent vantage points, classified together.
if [ "$lan_ok" = "1" ] && [ "$pub_ok" = "1" ]; then
    ok=1; title=""; reasons=""
elif [ "$lan_ok" = "1" ] && [ "$pub_ok" != "1" ]; then
    ok=0; title="Public/external connectivity degraded"
    reasons="Beelink is healthy on the LAN, but the public endpoint ($PUBLIC_HEALTH_URL) returned HTTP ${pub_code:-timeout}. This points at the tunnel, gateway, DNS, or ISP egress path — not Beelink or home power."
elif [ "$lan_ok" != "1" ] && [ "$pub_ok" != "1" ]; then
    ok=0; title="HUNGREE Goat broadcast host unreachable"
    reasons="Both the LAN check and the public endpoint failed from this vantage point ($lan_reason; public HTTP ${pub_code:-timeout}). Possible causes: Beelink host, LAN, router, or home power — not claimed with certainty, just the evidence from here."
else
    ok=0; title="Local network anomaly"
    reasons="LAN check to Beelink failed ($lan_reason) but the public endpoint still responded — unusual; may be this Pi's own network interface rather than Beelink itself."
fi

now=$(date +%s)
prev_status="unknown"; prev_first_bad=0; prev_last_alert=0
[ -f "$STATE_FILE" ] && read -r prev_status prev_first_bad prev_last_alert < "$STATE_FILE"

if [ "$ok" = "1" ]; then
    if [ "$prev_status" = "bad" ]; then
        dur=$((now - prev_first_bad))
        notify "HUNGREE Goat RECOVERED [$LABEL]" "Beelink reachable (LAN) and the public endpoint is healthy again. Outage duration: $((dur/60))m $((dur%60))s." "high"
    fi
    printf 'good %s %s\n' "$now" "$now" > "$STATE_FILE"
else
    if [ "$prev_status" != "bad" ]; then
        notify "HUNGREE Goat: $title [$LABEL]" "$reasons" "urgent"
        printf 'bad %s %s\n' "$now" "$now" > "$STATE_FILE"
    elif [ $((now - prev_last_alert)) -ge "$COOLDOWN_SEC" ]; then
        dur=$((now - prev_first_bad))
        notify "HUNGREE Goat STILL: $title [$LABEL]" "$((dur/60))m elapsed. $reasons" "urgent"
        printf 'bad %s %s\n' "$prev_first_bad" "$now" > "$STATE_FILE"
    fi
fi
