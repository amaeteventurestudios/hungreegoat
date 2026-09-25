# Decision log

Architecture decisions for the broadcast stack, newest first. Each entry records the problem,
evidence, alternatives, choice, trade-offs and rollback, so nobody has to rediscover them.

## 2026-09-25 — FFmpeg ignores the declared WAV length on the Liquidsoap audio input

Decided and implemented by an AI agent (Claude Code) during a production investigation.

- **Problem.** FFmpeg live-locked (heartbeat alive, `frame`/`out_time` frozen) after
  ~22,865 s of every run, forcing a watchdog restart and a ~40 s YouTube gap every ~6h21m.
  Before the forward-progress watchdog existed it caused hours of dead air.
- **Evidence.** Liquidsoap's `%wav` output on the endless loopback mount declares a fixed
  `data` chunk of 4,026,531,803 bytes = 22,826.1 s at 44.1 kHz s16 stereo. FFmpeg's wav
  demuxer stops delivering audio there (logged `pcm_s16le … Invalid data` right before every
  such stall). Reproduced with the production FFmpeg 8.0.1 build and a scaled-down header;
  `-ignore_length 1` removes it. Full record: `docs/streaming/FFMPEG_STALL_INVESTIGATION.md`.
- **Alternatives.** (a) `-ignore_length 1` in FFmpeg; (b) headerless PCM from Liquidsoap
  (`%wav(header=false)`) + `-f s16le` in FFmpeg; (c) preventive FFmpeg rotation every ~6 h;
  (d) nothing (watchdog absorbs it).
- **Choice.** (a). A one-argument change on the consumer that has the bug; restarts only the
  stream container; Liquidsoap and the music stay untouched; WAV header still describes the
  format.
- **Trade-offs.** FFmpeg no longer uses the WAV size field at all (it is meaningless on an
  endless stream anyway). A loopback reconnect would feed a 44-byte header in as ~0.25 ms of
  PCM (inaudible, frame-aligned). (b) remains the cleaner long-term option if the audio leg is
  ever reworked. (c) was rejected because it hides the defect and still interrupts viewers.
- **Rollback.** Restore the previous `~/hungree-goat/app/hgc/streamer.py` (a `.bak-*` copy is
  made on deploy) and `systemctl --user restart hungree-goat-stream@lofi`. That reintroduces the
  6h21m stall.
- **Also added (independent, safe to keep):** timestamps on FFmpeg stderr lines, a `/proc`
  stall snapshot before the watchdog kills FFmpeg, and `hungree-goat-netprobe.service` for
  network correlation.
