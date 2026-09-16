#!/bin/bash
# Endurance monitor: one line per 30 s + any new kernel USB/ext4 lines.
LOG=$HOME/hungree-goat/logs/endurance.log
KLOG=$HOME/hungree-goat/logs/endurance-kernel.log
LAST=$(date +%s)
echo "=== monitor start $(date -Is)" >> $LOG
while true; do
  T=$(date +%H:%M:%S); TEMP=$(($(cat /sys/class/thermal/thermal_zone0/temp)/1000)); THR=$(vcgencmd get_throttled | cut -d= -f2)
  LOAD=$(cut -d" " -f1-3 /proc/loadavg); MEM=$(free -m | awk '/Mem:/{printf "%d/%dMB", $3, $2}')
  FF=$(ps -C ffmpeg -o %cpu,rss --no-headers | head -1 | awk '{printf "ffmpeg cpu=%s rss=%dMB", $1, $2/1024}'); [ -z "$FF" ] && FF="ffmpeg NONE"
  LQ=$(docker stats --no-stream --format "{{.CPUPerc}} {{.MemUsage}}" hg-liq-lofi 2>/dev/null | awk '{printf "liq cpu=%s mem=%s", $1, $2}'); [ -z "$LQ" ] && LQ="liq NONE"
  ST=$(python3 -c "import json;d=json.load(open('$HOME/hungree-goat/run/stream-lofi.json'));print(f\"state={d['state']} fps={d['fps']} speed={d['speed']} kbps={d['bitrate_kbps']} dup={d['dup_frames']} drop={d['drop_frames']} up={d['uptime_sec']} restarts={d['restarts']}\")" 2>/dev/null)
  MNT=$(grep " /media/hungree-goat " /proc/mounts | awk '{print $1" "$4}'); W=$(touch /media/hungree-goat/.mon 2>/dev/null && rm /media/hungree-goat/.mon && echo w+ || echo W-FAIL)
  echo "$T temp=${TEMP}C thr=$THR load=$LOAD mem=$MEM | $FF | $LQ | $ST | $MNT $W" >> $LOG
  NOW=$(date +%s); journalctl -k --no-pager -o short-iso --since "@$LAST" 2>/dev/null | grep -iE "usb|sd[a-z]|ext4|reset|i/o error|voltage" >> $KLOG; LAST=$NOW
  sleep 30
done
