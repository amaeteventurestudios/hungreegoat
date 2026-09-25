# FFmpeg ~6h21m live-lock — investigation, root cause, fix

Investigation and fix carried out by an AI agent (Claude Code) on the production Beelink,
2026-09-25. All times below are **UTC** (the stream container logs in UTC; the host clock is
UTC−7).

## TL;DR

Every "FFmpeg stall detected (progress heartbeat is live but frame/out_time hasn't advanced for
30s (encode live-locked))" at **~22,865 s** of FFmpeg runtime was caused by the **WAV header on
Liquidsoap's endless loopback audio mount**, not by the network, VAAPI, or the FIFOs.

- Liquidsoap's `%wav` encoder writes a header that declares a **fixed data-chunk size**:
  `data` = `0xEFFFFFDB` = **4,026,531,803 bytes** (RIFF = `0xEFFFFFFF`).
- The mount is **44,100 Hz, s16, stereo** = 176,400 bytes/s (not 48 kHz — FFmpeg resamples).
- 4,026,531,803 ÷ 176,400 = **22,826.1 s**. + the watchdog's 30 s forward-progress threshold
  = **~22,856–22,866 s**, the observed `ran_for`.
- FFmpeg's wav demuxer honours the declared size. At that byte it treats the following PCM as
  RIFF chunk headers → `Invalid PCM packet, data has size 3…` / `Decoding error: Invalid data
  found when processing input` → audio stops → the muxer can't interleave → `frame`/`out_time`
  freeze while `-progress` keeps ticking. The process also ignores SIGTERM in this state
  (every one needed SIGKILL, `rc=-9`).
- **Fix:** `-ignore_length 1` on the WAV input (`apps/control/hgc/streamer.py::ffmpeg_cmd`).
  FFmpeg then treats the data chunk as unbounded. One argument; Liquidsoap unchanged.

## Evidence

1. **The header, captured from the live mount** (`curl -s http://127.0.0.1:8100/lofi.wav | xxd`):
   ```
   RIFF ffffffef WAVE fmt  10000000 0100 0200 44ac0000 10b10200 0400 1000 data dbffffef
                                    PCM  2ch  44100     176400   blk4 16bit      ^ 0xEFFFFFDB
   ```
2. **Every watchdog stall at ~22,865 s is immediately preceded by the pcm_s16le decode error**
   on input #2 (the WAV) and by nothing else — see table below (10 of 10, plus one at 22,911.5 s).
3. **Reproduced with the production FFmpeg build** (8.0.1-3ubuntu2, the `hgc-stream` image), in
   a throwaway `--network none` container, same input options, fed by a local HTTP server that
   streams real-time 44.1 kHz PCM with a header declaring only 8 s:
   - without `-ignore_length`: `frame=242 out_time=7.936` then **frozen** for the rest of the
     run while progress blocks kept arriving — the production signature; `timeout`'s SIGTERM
     did not end it (had to `docker kill`), matching production's SIGKILL-only exits.
   - with `-ignore_length 1`: advanced linearly to `frame=631 out_time=21.03`, read 3.8 MB of
     audio (2.7× the declared 1.41 MB), **0 decode errors**.
4. **Before the forward-progress detector existed (added 2026-09-21)** the same boundary was hit
   and FFmpeg simply sat live-locked until someone stopped the service: runs of 56,499 s,
   52,815 s, 37,094 s and 24,231 s, each with the pcm decode error, i.e. ~9.4 h, 8.3 h, 4.0 h
   and 23 min of dead air after 22,826 s. This is consistent with the 2026-09-20/21
   "YouTube stopped receiving data while everything looked green" incident.

## Every FFmpeg run in `logs/ffmpeg-lofi.log` (2026-09-19 → 2026-09-25)

Class is derived from the last FFmpeg error line before the exit. `WAV-boundary` = the
pcm_s16le decode error; `NET-*` = RTMPS/TLS output errors or YouTube DNS/connect failures;
`stopped/other rc=255` = service stop/deploy/host reboot (host booted 2026-09-24 ~22:52).

| FFmpeg start | Exit | Runtime s | Class |
|---|---|---:|---|
| 2026-09-19 00:19:20 | 2026-09-19 00:59:57 | 2436.9 | stopped/other rc=255 |
| 2026-09-19 00:59:58 | 2026-09-19 01:02:28 | 150.2 | stopped/other rc=255 |
| 2026-09-19 01:02:46 | 2026-09-19 16:44:25 | 56499.4 | WAV-boundary, no detector yet |
| 2026-09-19 16:44:26 | 2026-09-20 07:24:41 | 52815.3 | WAV-boundary, no detector yet |
| 2026-09-20 07:24:42 | 2026-09-20 17:42:56 | 37094.4 | WAV-boundary, no detector yet |
| 2026-09-20 17:42:57 | 2026-09-21 00:26:48 | 24231.5 | WAV-boundary, no detector yet |
| 2026-09-21 00:26:49 | 2026-09-21 02:56:41 | 8991.8 | stopped/other rc=255 |
| 2026-09-21 02:56:41 | 2026-09-21 08:05:15 | 18513.4 | NET-eof |
| 2026-09-21 08:05:18 | 2026-09-21 09:30:06 | 5088.1 | stall, cause not logged |
| 2026-09-21 09:30:09 | 2026-09-21 09:30:15 | 6.0 | NET-dns |
| 2026-09-21 09:30:21 | 2026-09-21 09:30:27 | 6.0 | NET-dns |
| 2026-09-21 09:30:39 | 2026-09-21 09:30:45 | 6.0 | NET-dns |
| 2026-09-21 09:31:09 | 2026-09-21 09:31:15 | 6.0 | NET-dns |
| 2026-09-21 09:32:03 | 2026-09-21 09:32:09 | 6.0 | NET-dns |
| 2026-09-21 09:33:09 | 2026-09-21 15:54:15 | 22865.9 | WAV-boundary (stall) |
| 2026-09-21 15:54:18 | 2026-09-21 22:15:23 | 22865.5 | WAV-boundary (stall) |
| 2026-09-21 22:15:26 | 2026-09-22 04:36:32 | 22865.4 | WAV-boundary (stall) |
| 2026-09-22 04:36:35 | 2026-09-22 10:57:40 | 22865.3 | WAV-boundary (stall) |
| 2026-09-22 10:57:43 | 2026-09-22 13:44:19 | 9995.8 | NET-reset |
| 2026-09-22 13:44:22 | 2026-09-22 13:45:12 | 50.1 | stall, cause not logged |
| 2026-09-22 13:45:18 | 2026-09-22 13:45:34 | 16.0 | NET-dns |
| 2026-09-22 13:45:46 | 2026-09-22 13:46:02 | 16.0 | NET-dns |
| 2026-09-22 13:46:26 | 2026-09-22 13:46:42 | 16.0 | NET-dns |
| 2026-09-22 13:47:30 | 2026-09-22 13:47:42 | 12.0 | NET-dns |
| 2026-09-22 13:48:42 | 2026-09-22 13:48:58 | 16.0 | NET-dns |
| 2026-09-22 13:49:58 | 2026-09-22 19:22:52 | 19973.9 | stall, cause not logged |
| 2026-09-22 19:22:55 | 2026-09-23 01:44:47 | 22911.5 | WAV-boundary (stall) |
| 2026-09-23 01:44:50 | 2026-09-23 02:23:51 | 2341.0 | NET-reset |
| 2026-09-23 02:23:54 | 2026-09-23 08:41:31 | 22656.9 | stall, cause not logged |
| 2026-09-23 08:41:34 | 2026-09-23 08:48:52 | 438.2 | NET-reset |
| 2026-09-23 08:48:55 | 2026-09-23 13:25:38 | 16603.2 | NET-pipe |
| 2026-09-23 13:25:41 | 2026-09-23 19:46:48 | 22866.4 | WAV-boundary (stall) |
| 2026-09-23 19:46:51 | 2026-09-23 22:22:26 | 9335.3 | NET-pipe |
| 2026-09-23 22:22:29 | 2026-09-24 03:52:59 | 19830.2 | NET-pipe |
| 2026-09-24 03:53:02 | 2026-09-24 10:14:07 | 22865.0 | WAV-boundary (stall) |
| 2026-09-24 10:14:10 | 2026-09-24 16:35:16 | 22865.5 | WAV-boundary (stall) |
| 2026-09-24 16:35:19 | 2026-09-24 18:52:08 | 8209.3 | NET-eof |
| 2026-09-24 18:52:11 | 2026-09-24 22:12:19 | 12008.4 | stopped/other rc=255 |
| 2026-09-24 22:28:46 | 2026-09-24 22:28:48 | 2.0 | LOCAL-liq-down |
| 2026-09-24 22:28:54 | 2026-09-24 22:52:15 | 1400.6 | stopped/other rc=255 |
| 2026-09-24 22:52:46 | 2026-09-24 22:52:48 | 2.0 | LOCAL-liq-down |
| 2026-09-24 22:52:54 | 2026-09-25 05:13:59 | 22865.2 | WAV-boundary (stall) |
| 2026-09-25 05:14:02 | 2026-09-25 11:35:07 | 22865.0 | WAV-boundary (stall) |
| 2026-09-25 11:35:10 | 2026-09-25 17:56:17 | 22866.9 | WAV-boundary (stall) |
| 2026-09-25 17:56:20 | 2026-09-25 18:51:16 | 3295.4 | stopped/other rc=255 |

**The 6h21m numbers:** WAV-boundary stalls since the detector went live: n = 11, runtimes
22,865.0 / 22,865.0 / 22,865.2 / 22,865.3 / 22,865.4 / 22,865.5 / 22,865.5 / 22,865.9 /
22,866.4 / 22,866.9 / 22,911.5 s. Ten fall in a 1.9 s window; predicted = 22,826.1 + 30 s
threshold + ≤ 2 s supervisor poll + FFmpeg start-up/probe ≈ 22,857–22,868 s. It depends on
**audio bytes consumed** (≈ process age), not wall-clock time of day, track, playlist,
schedule, memory or network. **No FFmpeg process has ever streamed healthily beyond 22,866 s.**

## Classification: Internet vs local

| Class | Runs | What it was |
|---|---:|---|
| Local — WAV length boundary (**fixed**) | 15 (11 detected + 4 pre-detector) | this document's root cause |
| Network — RTMPS output reset/broken pipe/EOF | 8 | `Connection reset by peer` ×3, `Broken pipe` ×3, TLS `End of file` ×2 at 438–19,830 s. The TCP/TLS session to YouTube was torn down; whether ISP path or YouTube side can't be separated from history (no telemetry then) — the new netprobe (below) makes that possible |
| Network — DNS/connect on reconnect | 10 short retries in 2 bursts (09-21 09:30, 09-22 13:45) | `Failed to resolve hostname a.rtmps.youtube.com: Temporary failure in name resolution`. Host DNS goes via Tailscale MagicDNS (100.100.100.100), which systemd-resolved repeatedly logs as degraded (UDP without EDNS0) |
| Stall, cause not logged | 3 (5,088 s; 19,974 s; 22,657 s) + 1 in a network burst (50 s) | Not explained by the WAV boundary (no decode error, wrong byte count) and nothing else logged. **Open.** The new stall snapshot + timestamped stderr + netprobe are there to classify the next one |
| Local — Liquidsoap not up yet at start | 2 | `Connection refused` on the WAV URL right after a reboot/deploy; supervisor retried, fine |
| Operator/host stops | 6 | deploys, the 09-24 reboot, and the 2026-09-25 18:51 deploy of this fix |

## Other hypotheses checked

- **VAAPI / amdgpu — ruled out** for these stalls: 0 amdgpu error/fault/timeout/reset lines in
  7 days of kernel log; the stall is on the audio input and reproduces with libx264 and no GPU.
- **Video FIFO / overlay pipe — ruled out** as cause: both are fed from the supervisor with
  back-pressure; the repro had neither. (`BgFeeder` writes a repeated last frame when the helper
  is late, so the background input cannot starve FFmpeg.)
- **Liquidsoap "Latency is too high: we must catchup N seconds"** — real, not cosmetic, but not
  the stall cause: 330 lines in the current log (max 16.1 s, 424 s total), clustered
  2026-09-25 02:00–05:59 and 16:00–17:59. Liquidsoap's clock fell behind wall time and then
  produced faster to catch up — the byte count per wall-second is preserved, so it doesn't move
  the 22,826 s boundary. The host was under real memory pressure at the time (12 GB RAM, ~3 GB
  swap in use, a `llama-server` from another workload OOM-killed at 17:33 UTC 09-25). Treat it
  as a host-contention signal; the fix is resource isolation, not `self_sync` changes.
- **Liquidsoap "Error while parsing XML playlist" / "SCPLS playlist: Not_found"** — cosmetic.
  On every reload of `lofi-fallback.m3u` Liquidsoap tries its playlist parsers in turn; XML and
  PLS fail, M3U succeeds and the next track decodes. Deprioritized.
- **Integer/timestamp rollover** — the boundary is exactly the declared WAV size; no FFmpeg
  counter overflow involved.

## Known side effect of the fix

`-reconnect_streamed 1` means that if the loopback HTTP connection ever drops, FFmpeg reconnects
and Liquidsoap sends a fresh 44-byte WAV header, which the demuxer (now ignoring the length)
reads as ~0.25 ms of PCM — an inaudible click, frame-aligned (44 is a multiple of the 4-byte
block). Previously a reconnect would have had the same effect.

## Alternatives considered

1. **`-ignore_length 1` (chosen)** — one FFmpeg argument, only the stream container restarts,
   Liquidsoap untouched, proven in repro. Rollback = restore the previous `streamer.py`.
2. **Headerless raw PCM** (`%wav(header=false)` in Liquidsoap + `-f s16le -ar 44100 -ac 2` in
   FFmpeg) — also correct, but changes both sides and restarts Liquidsoap (music interruption)
   and couples FFmpeg to Liquidsoap's sample format with no header to check it.
3. **Preventive rotation** before 6h20m — rejected: it hides the defect, still costs a visible
   interruption every ~6 h, and isn't needed now that the cause is known.
4. **Weakening the watchdog** — rejected; the watchdog was right every time.

## Instrumentation added

- **Timestamped FFmpeg stderr** — every FFmpeg line in `logs/ffmpeg-<sid>.log` is now prefixed
  `[YYYY-MM-DD HH:MM:SS] [ffmpeg]`. Before this, the decode error could not be dated.
- **Stall snapshot** — on a detected stall the supervisor logs, before killing FFmpeg,
  `stall snapshot: pid=… rchar=… wchar=… threads=[name:state:wchan xN …]` from `/proc` only
  (no ptrace). E.g. all threads parked in futex waits with `wchar` frozen = pipeline starved;
  a thread in a socket send wait = output back-pressure.
- **Network probe** — `infra/beelink/bin/hgc-netprobe.sh` as user unit
  `hungree-goat-netprobe.service`, one line / 30 s to `~/hungree-goat/logs/netprobe.log`:
  interface link state, gateway ping, DNS time for `a.rtmps.youtube.com`, TCP connect time to
  it on :443 (no TLS, no key), public ping (1.1.1.1), and the live FFmpeg's :443 socket Send-Q.
  ~4 tiny packets per 30 s. Self-rotates at 20 MB. (`dns`/`ytcp` ms include ~100 ms of
  process start-up; compare them to their own baseline, not as absolute RTTs.)

To classify the next incident, line up by UTC timestamp:
`logs/ffmpeg-<sid>.log` (stall line + snapshot + last `[ffmpeg]` error) ↔ `logs/netprobe.log`
↔ `run/liq-<sid>.log` (Liquidsoap) ↔ `journalctl -k`.

| Signature | Class |
|---|---|
| netprobe `gw=FAIL` or `link=down` | LAN / NIC |
| gw ok, `inet=FAIL` | ISP / Internet |
| inet ok, `dns=FAIL` | DNS (Tailscale MagicDNS / upstream) |
| inet+dns ok, `ytcp=FAIL` or TLS reset/pipe in FFmpeg log | YouTube ingest / path to it |
| `out=sendq=` climbing for several lines before the stall | output back-pressure |
| `[ffmpeg]` pcm/wav error or HTTP reconnect on input #2 | audio source (Liquidsoap / loopback) |
| `[bg]` helper failures, fifo errors | background video source |
| amdgpu lines in `journalctl -k` | VAAPI / GPU |
| none of the above | FFmpeg-internal — keep the snapshot and file an issue |

## Verification

- Unit tests: `apps/control/tests/test_streamer_stall.py` (9 tests, run in the production image),
  including `TestWavInputIgnoresDeclaredLength`, which fails against the pre-fix code.
- Deployed 2026-09-25 18:51:14 UTC (stream unit restart only; ~2 s ingest gap). Immediately
  after: FFmpeg running with `-ignore_length 1`, frames/out_time advancing, ~30 fps, speed
  settling to 1.0x, ~3.2 Mbps, `/v1/health/broadcast` = healthy / "Verified Live".
- **Still required:** the first FFmpeg process to pass **22,866 s** (~6h21m, i.e. after
  **2026-09-26 01:12 UTC** for the process started 18:51:16 UTC) without a stall is the real
  proof. Check with the runbook commands in `docs/streaming/RUNBOOK.md`.
