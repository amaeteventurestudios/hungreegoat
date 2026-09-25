# Stream runbook (Beelink production)

Diagnose the live video stream without restarting anything first. Background and history:
[FFMPEG_STALL_INVESTIGATION.md](FFMPEG_STALL_INVESTIGATION.md). Logs are in **UTC**; the host
clock is local time.

## Is it healthy right now?

```bash
curl -s http://127.0.0.1:8090/v1/health/broadcast        # status, fps, speed, youtube_ingest/broadcast
cat ~/hungree-goat/run/stream-lofi.json                  # frame, out_time_sec, speed, uptime_sec, restarts
pgrep -a ffmpeg                                          # main encoder + background helper
ps -o pid,lstart,etimes,rss,nlwp,pcpu -p "$(pgrep -f 'progress pipe:1')"   # encoder age (etimes = seconds)
tail -5 ~/hungree-goat/logs/netprobe.log                 # network at this moment
```

Healthy: `frame`/`out_time_sec` both increase between two reads 10 s apart, `speed` ≈ 1x,
fps ≈ 30, bitrate ≈ 3.2 Mbps, `drop_frames` not climbing. Speed 1.05–1.2x for the first
minute after a restart is normal catch-up.

## Recognising a live-lock

`stream-lofi.json` keeps updating (`progress_ts` fresh) but `frame`/`out_time_sec` do not move.
You don't need to act: the supervisor's `StallDetector` kills and restarts FFmpeg after 30 s and
logs an Incident History entry. Look afterwards:

```bash
grep -nE 'stall detected|stall snapshot|main ffmpeg exited' ~/hungree-goat/logs/ffmpeg-lofi.log | tail
grep -n '\[ffmpeg\]' ~/hungree-goat/logs/ffmpeg-lofi.log | tail -20      # FFmpeg's own errors, timestamped
```

Then use the signature table at the end of the investigation doc to tell network, YouTube,
audio, background video, GPU and FFmpeg-internal apart. Line things up by UTC time with:

```bash
grep '2026-09-26 01:1' ~/hungree-goat/logs/netprobe.log          # network around the event
grep '2026/09/26 01:1' ~/hungree-goat/run/liq-lofi.log | grep -v 'unix socket'  # Liquidsoap
journalctl -k --since '-2h' | grep -iE 'amdgpu|drm|oom|link'         # kernel (local time)
```

`[ffmpeg]` lines with `pcm_s16le … Invalid data` on input #2 at ~22,826 s of runtime mean the
`-ignore_length 1` fix has been lost. Check `pgrep -a ffmpeg | grep -o 'wav -ignore_length 1'`.

## Restarting — only the right thing

| Unit (`systemctl --user …`) | Interrupts | When |
|---|---|---|
| `hungree-goat-stream@lofi` | video/YouTube ingest for ~2–10 s | after deploying `streamer.py`; never just to "try" (the supervisor already restarts FFmpeg by itself) |
| `hungree-goat-liquidsoap@lofi` | music and the stream's audio | only for Liquidsoap config changes |
| `hungree-goat-control` | nothing on air | backend/UI deploys |
| `hungree-goat-netprobe` | nothing | telemetry only |

The supervisor loads `streamer.py` once at start: code changes to it need a stream-unit restart.
FFmpeg-only restarts (stall recovery) reuse the already-loaded code.

## Deploying `streamer.py` and rolling back

```bash
cp -a ~/hungree-goat/app/hgc/streamer.py ~/hungree-goat/app/hgc/streamer.py.bak-$(date +%Y%m%d-%H%M%S)
cp apps/control/hgc/streamer.py ~/hungree-goat/app/hgc/streamer.py
systemctl --user restart hungree-goat-stream@lofi
# rollback: copy the .bak-* file back and restart the same unit
```

Rolling back the 2026-09-25 fix brings back the 22,826-s audio cut-off (and a ~40 s outage every
~6h21m). Don't do that without a replacement for it.

## Network probe

`hungree-goat-netprobe.service` (user unit) runs `~/hungree-goat/bin/hgc-netprobe.sh`, writing
one line every 30 s to `~/hungree-goat/logs/netprobe.log` (rotates to `.1` at 20 MB):
`if= link= gw=<ms|FAIL> dns=<ms|FAIL> ytcp=<ms|FAIL> inet=<ms|FAIL> out=sendq=<bytes> peer=…`.
Disable it with `systemctl --user disable --now hungree-goat-netprobe`; nothing depends on it.
