#!/bin/bash
# Endurance monitor (Beelink/x86_64 variant): one line per 30s + any new kernel
# USB/ext4 lines. Same shape as the Pi's version but temperature comes from
# k10temp/amdgpu hwmon instead of vcgencmd (no vcgencmd on this box), and both
# the control app and the video pipeline are now containers, not bare processes.
LOG=$HOME/hungree-goat/logs/endurance.log
KLOG=$HOME/hungree-goat/logs/endurance-kernel.log
LAST=$(date +%s)

cpu_temp_path() {
  for f in /sys/class/hwmon/hwmon*/name; do
    [ "$(cat "$f" 2>/dev/null)" = "k10temp" ] && echo "$(dirname "$f")/temp1_input" && return
  done
}
gpu_temp_path() {
  for f in /sys/class/hwmon/hwmon*/name; do
    [ "$(cat "$f" 2>/dev/null)" = "amdgpu" ] && echo "$(dirname "$f")/temp1_input" && return
  done
}
CPU_TEMP_FILE=$(cpu_temp_path)
GPU_TEMP_FILE=$(gpu_temp_path)

echo "=== monitor start $(date -Is)" >> "$LOG"
while true; do
  T=$(date +%H:%M:%S)
  CPUTEMP="n/a"; [ -n "$CPU_TEMP_FILE" ] && CPUTEMP=$(( $(cat "$CPU_TEMP_FILE") / 1000 ))
  GPUTEMP="n/a"; [ -n "$GPU_TEMP_FILE" ] && GPUTEMP=$(( $(cat "$GPU_TEMP_FILE") / 1000 ))
  LOAD=$(cut -d" " -f1-3 /proc/loadavg); MEM=$(free -m | awk '/Mem:/{printf "%d/%dMB", $3, $2}')
  FF=$(ps -C ffmpeg -o %cpu,rss --no-headers | head -1 | awk '{printf "ffmpeg cpu=%s rss=%dMB", $1, $2/1024}'); [ -z "$FF" ] && FF="ffmpeg NONE"
  LQ=$(docker stats --no-stream --format "{{.CPUPerc}} {{.MemUsage}}" hg-liq-lofi 2>/dev/null | awk '{printf "liq cpu=%s mem=%s", $1, $2}'); [ -z "$LQ" ] && LQ="liq NONE"
  CTL=$(docker stats --no-stream --format "{{.CPUPerc}} {{.MemUsage}}" hgc-control 2>/dev/null | awk '{printf "ctl cpu=%s mem=%s", $1, $2}'); [ -z "$CTL" ] && CTL="ctl NONE"
  STR=$(docker stats --no-stream --format "{{.CPUPerc}} {{.MemUsage}}" hgc-stream-lofi 2>/dev/null | awk '{printf "strm cpu=%s mem=%s", $1, $2}'); [ -z "$STR" ] && STR="strm NONE"
  ST=$(python3 -c "import json;d=json.load(open('$HOME/hungree-goat/run/stream-lofi.json'));print(f\"state={d['state']} fps={d['fps']} speed={d['speed']} kbps={d['bitrate_kbps']} dup={d['dup_frames']} drop={d['drop_frames']} up={d['uptime_sec']} restarts={d['restarts']}\")" 2>/dev/null)
  MNT=$(grep " /media/hungree-goat " /proc/mounts | awk '{print $1" "$4}'); W=$(touch /media/hungree-goat/.mon 2>/dev/null && rm /media/hungree-goat/.mon && echo w+ || echo W-FAIL)
  echo "$T cputemp=${CPUTEMP}C gputemp=${GPUTEMP}C load=$LOAD mem=$MEM | $FF | $LQ | $CTL | $STR | $ST | $MNT $W" >> "$LOG"
  NOW=$(date +%s); journalctl -k --no-pager -o short-iso --since "@$LAST" 2>/dev/null | grep -iE "usb|sd[a-z]|ext4|reset|i/o error|voltage" >> "$KLOG"; LAST=$NOW
  sleep 30
done
