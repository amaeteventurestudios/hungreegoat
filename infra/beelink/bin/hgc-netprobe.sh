#!/bin/bash
# Network-correlation probe for the live stream (see docs/streaming/FFMPEG_STALL_INVESTIGATION.md).
# One line every INTERVAL seconds so any FFmpeg stall/exit in logs/ffmpeg-<sid>.log can be
# matched to the network state at that moment:
#   link    — outbound interface operstate
#   gw      — LAN default-gateway ping RTT (ms) or FAIL
#   dns     — time to resolve the YouTube RTMPS ingest host (ms) or FAIL
#   ytcp    — TCP connect to that host:443 (ms) or FAIL — no TLS/RTMP handshake, no stream key
#   inet    — public-Internet ping RTT (ms) or FAIL
#   out     — the live FFmpeg's established :443 socket: Send-Q bytes (output back-pressure
#             shows as a Send-Q that keeps growing) or NONE
# Cost: ~1 ICMP to the gateway, 1 to 1.1.1.1, 1 DNS lookup, 1 TCP SYN/close per interval.
# All timestamps UTC to match the stream supervisor's log.
set -u
INTERVAL="${HGC_NETPROBE_INTERVAL:-30}"
HOST="${HGC_NETPROBE_YT_HOST:-a.rtmps.youtube.com}"
PUBLIC="${HGC_NETPROBE_PUBLIC:-1.1.1.1}"
LOG="${HGC_NETPROBE_LOG:-$HOME/hungree-goat/logs/netprobe.log}"
MAX_BYTES=$((20 * 1024 * 1024))
mkdir -p "$(dirname "$LOG")"

ms() { echo $(( ($(date +%s%N) - $1) / 1000000 )); }
ping_ms() { ping -n -c1 -W2 "$1" 2>/dev/null | sed -n 's/.*time=\([0-9.]*\).*/\1/p' | head -1; }

while true; do
  read -r _ _ GW _ IF _ < <(ip -4 route show default | head -1)
  LINK=$(cat "/sys/class/net/${IF:-none}/operstate" 2>/dev/null || echo "?")
  G=$(ping_ms "${GW:-0.0.0.0}"); G=${G:-FAIL}
  t=$(date +%s%N); IP=$(timeout 5 getent ahostsv4 "$HOST" | awk 'NR==1{print $1}')
  if [ -n "$IP" ]; then D=$(ms "$t"); else D=FAIL; fi
  Y=FAIL
  if [ -n "$IP" ]; then
    t=$(date +%s%N)
    if timeout 5 bash -c "exec 3<>/dev/tcp/$IP/443" 2>/dev/null; then Y=$(ms "$t"); fi
  fi
  P=$(ping_ms "$PUBLIC"); P=${P:-FAIL}
  O=$(ss -tnpH state established '( dport = :443 )' 2>/dev/null | awk '/"ffmpeg"/{print "sendq=" $2 " peer=" $4; exit}')
  printf '%s if=%s link=%s gw=%s dns=%s ytcp=%s inet=%s out=%s\n' \
    "$(date -u '+%Y-%m-%d %H:%M:%S')" "${IF:-none}" "$LINK" "$G" "$D" "$Y" "$P" "${O:-NONE}" >> "$LOG"
  if [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" -gt "$MAX_BYTES" ]; then mv -f "$LOG" "$LOG.1"; fi
  sleep "$INTERVAL"
done
