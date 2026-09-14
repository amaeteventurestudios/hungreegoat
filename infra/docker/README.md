# Liquidsoap container
The Debian `liquidsoap` package segfaults on Raspberry Pi OS Trixie (FFmpeg ABI mismatch), so the audio engine runs the
official image `savonet/liquidsoap:v2.4.5` via `infra/pi/bin/hgc-liquidsoap.sh` (host network, uid 1000, media read-only,
memory 512 MB, CPU 1.5). Ports: 8100/8101 (loopback AAC + MP3 mounts), 8105/8106 (DJ input, loopback unless widened).
