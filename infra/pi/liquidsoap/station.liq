# HUNGREE Goat — Liquidsoap station script (Liquidsoap 2.3.x)
# One process per station. Parameterised through environment variables set by
# bin/hgc-liquidsoap.sh. Track selection is delegated to the control backend
# (request.dynamic → HTTP); if the backend is unreachable the station keeps
# playing from its static fallback playlist. Nothing here is reachable from the
# network except the harbor ports (audio out on 127.0.0.1, optional live input).

station     = environment.get("STATION")
harbor_port = int_of_string(environment.get("HARBOR_PORT"))
live_port   = int_of_string(environment.get("LIVE_PORT"))
live_bind   = environment.get("LIVE_BIND")            # 127.0.0.1 or 0.0.0.0
live_pass   = environment.get("LIVE_PASSWORD")
backend     = environment.get("BACKEND_URL")           # http://127.0.0.1:8090
api_token   = environment.get("INTERNAL_TOKEN")
fallback_m3u = environment.get("FALLBACK_M3U")
emergency_dir = environment.get("EMERGENCY_DIR")
sock_path   = environment.get("SOCKET_PATH")
audio_kbps  = environment.get("AUDIO_KBPS")

settings.log.level := 3
# Full log goes to a file the backend tails and size-caps; the journal only gets
# fatal errors from stderr (the unix-socket client chatter would otherwise flood it).
settings.log.stdout := false
settings.log.file := true
settings.log.file.path := "/run/hg/liq-#{station}.log"
settings.log.file.append := true
settings.init.allow_root := true
settings.server.socket := true
settings.server.socket.path := sock_path
settings.server.socket.permissions := 0o660
settings.server.telnet := false
# One bind address for all harbor ports: loopback by default; the operator can
# widen this to 0.0.0.0 (LAN) when a DJ needs to connect to the live input.
settings.harbor.bind_addrs := [live_bind]
settings.frame.duration := 0.04
settings.request.timeout := 20.
# Let the output see our own tags so the backend can rebuild now-playing after a restart.
settings.encoder.metadata.export := ["artist", "title", "album", "genre", "filename", "hgc_track_id", "hgc_source", "hgc_kind"]

hdrs = [("X-HGC-Token", api_token), ("Content-Type", "application/json")]

def notify(route, payload)
  thread.run({
    try
      ignore(http.post(headers=hdrs, timeout=5., data=json.stringify(payload), "#{backend}/api/internal/#{route}"))
    catch err do
      log.important(label="hgc", "backend notify failed (#{route}): #{err}")
    end
  })
end

# ---------------------------------------------------------------------------
# Operator-adjustable runtime switches (set through the unix socket by the backend)
force_fallback = interactive.bool("force_fallback", false)
guard_enabled  = interactive.bool("silence_guard", true)
live_enabled   = interactive.bool("live_enabled", false)
remote_enabled = interactive.bool("remote_enabled", false)

# ---------------------------------------------------------------------------
# Main source: ask the backend for the next track. One request is prefetched; the
# backend can drop it (hgc.requeue) so "play next" is honoured exactly.
def next_track()
  try
    resp = http.get(headers=hdrs, timeout=5., "#{backend}/api/internal/next?station=#{station}")
    if resp.status_code == 200 then
      uri = string.trim(resp)
      if uri == "" then null else request.create(uri) end
    else
      log.important(label="hgc", "backend next: HTTP #{resp.status_code}")
      null
    end
  catch err do
    log.important(label="hgc", "backend next failed: #{err}")
    null
  end
end

# prefetch=2 keeps a spare resolved request so the source never runs empty during a
# skip (an empty queue mid-crossfade crashed 2.3.3 with Source.Unavailable).
main_dyn = request.dynamic(id="main", prefetch=2, retry_delay=2., next_track)
main = main_dyn

# Static backup playlist (independent of the backend), then an emergency loop of
# whatever is in /media/hungree-goat/fallback, then generated silence-safe tone-free blank.
# Source tags travel inside the request (annotate:) — no metadata.map wrapper, which
# crashed with Source.Unavailable when pulled while its child had an empty queue.
backup_pl = playlist(id="backup", mode="randomize", reload=300, reload_mode="seconds",
                     prefix="annotate:hgc_source=\"backup\":", fallback_m3u)
backup = backup_pl
# Give the backend-driven main source a 4 s head start at boot so the station
# does not begin its day on the backup playlist just because of fetch latency.
backup = source.available(backup, {time.up() > 4.})
emergency = playlist(id="emergency", mode="randomize", reload=300, reload_mode="seconds",
                     prefix="annotate:hgc_source=\"emergency\":", emergency_dir)

# Live inputs: DJ/mic via harbor (Icecast-style source), or a remote URL pulled by the station.
live = input.harbor(id="live", port=live_port, password=live_pass, buffer=3., max=8., "live")
live = switch(id="live_gate", track_sensitive=false, [({live_enabled()}, live)])
# Started/stopped by the backend through `remote.url` / `remote.start` / `remote.stop`.
remote = input.http(id="remote", start=false, max_buffer=10., "")
remote = switch(id="remote_gate", track_sensitive=false, [({remote_enabled()}, remote)])



# ---------------------------------------------------------------------------
# Loudness: honour replaygain_track_gain annotations from the backend; a gentle
# dynamic normaliser guards against untagged material.
main = amplify(1., override="replaygain_track_gain", main)
backup = amplify(1., override="replaygain_track_gain", backup)
main = normalize(target=-16., gain_max=6., gain_min=-12., main)

# Silence guard: skip tracks that go silent, and report it.
main = blank.skip(id="silence_skip", max_blank=12., threshold=-45., track_sensitive=true, main)
main = blank.detect(id="silence_detect", max_blank=8., threshold=-45., main)
main.on_blank(synchronous=false, fun () -> begin
  if guard_enabled() then
    notify("event", {station=station, severity="warning", category="silence",
                     message="Silence detected on main source"})
  end
end)

# Track transitions: fade-in at the start of each track (duration per track via
# liq_fade_in metadata from the backend). Deliberately NOT `crossfade` (its look-ahead
# buffering wedged the pipeline under rapid skips) and NOT `fade.out` (on Liquidsoap
# 2.4.5 it silences the entire output — verified stage-by-stage on 2026-09-15).
main = fade.in(id="xfade", duration=1.5, main)
backup = fade.in(duration=1.5, backup)

# ---------------------------------------------------------------------------
# Routing: live > remote > (forced fallback) > main > backup > emergency > silence
automation = fallback(id="automation", track_sensitive=true, [main, backup, emergency])
manual = switch(id="manual_fallback", track_sensitive=false,
                [({force_fallback()}, fallback(track_sensitive=true, [backup, emergency])),
                 ({true}, automation)])
radio = fallback(id="radio", track_sensitive=false, [live, remote, manual])
radio = mksafe(radio)
# Real-time RMS for the dashboard meter (server command `meter.rms`).
radio = server.rms(id="meter", radio)

# ---------------------------------------------------------------------------
# Now-playing reporting and fallback-state reporting to the backend.
# on_metadata (not on_track): switches replay the child's metadata when resuming a
# track mid-way, which keeps the dashboard truthful after fallback/live changes.
radio.on_metadata(synchronous=false, fun (m) ->
  notify("now-playing", {station=station, filename=(m["filename"] ?? ""),
                         title=(m["title"] ?? ""), artist=(m["artist"] ?? ""),
                         source=(m["hgc_source"] ?? "unknown"), rid=(m["rid"] ?? ""),
                         track_id=(m["hgc_track_id"] ?? ""), on_air=(m["on_air"] ?? "")}))

# ---------------------------------------------------------------------------
# Output: raw PCM/WAV over a local harbor mount, consumed by the FFmpeg video
# pipeline. This leg is loopback-only (127.0.0.1), never exposed externally, so
# bandwidth is not a concern. It was previously AAC (%ffmpeg adts), but
# Liquidsoap's AAC encoder occasionally emits ADTS frames with multiple RDBs
# per frame, which FFmpeg's aac decoder AND its aac_adtstoasc bitstream filter
# both treat as a hard, unrecoverable error ("More than one AAC RDB per ADTS
# frame is not implemented"), crashing the whole stream process. PCM has no
# such parsing edge case and costs less CPU (no encode/decode at all). The
# final AAC encode for actual YouTube delivery still happens downstream in
# ffmpeg_cmd() in streamer.py, unaffected by this change.
pcm = %wav(stereo=true, samplesize=16)
output.harbor(id="out", mount="/#{station}.wav", port=harbor_port, pcm, radio)
# Listen Live / future public player: lightweight MP3 mount on the same harbor
# (proxied by the control backend; never exposed directly).
output.harbor(id="listen", mount="/#{station}-listen.mp3", port=harbor_port,
              %mp3(bitrate=128, samplerate=44100, stereo=true), radio)

# Extra server commands for the backend.
server.register(namespace="hgc", "requeue", fun (_) -> begin main_dyn.set_queue([]); "OK" end)
# Skip the track that is actually on air. The on-air source is read from the last metadata
# (annotate:hgc_source) so a skip right after a fallback switch lands on the right child
# instead of on the switch's transition source.
server.register(namespace="hgc", "skip", fun (_) -> begin
  if live.is_ready() or remote.is_ready() then
    "live input on air; not skipped"
  else
    m = radio.last_metadata() ?? []
    src = m["hgc_source"]
    if src == "main" then main_dyn.skip() "skipped main"
    elsif src == "backup" then backup.skip() "skipped backup"
    elsif src == "emergency" then emergency.skip() "skipped emergency"
    else radio.skip() "skipped" end
  end
end)
# Track id of the request a source is currently playing ("" when none).
def cur_track(r) =
  if null.defined(r) then
    m = request.metadata(null.get(r))
    m["hgc_track_id"]
  else
    ""
  end
end

def on_air_source() =
  m = radio.last_metadata() ?? []
  m["hgc_source"]
end

# One-shot state for the backend (one socket round-trip per dashboard refresh).
server.register(namespace="hgc", "state", fun (_) ->
  json.stringify({uptime=time.up(), on_air_source=on_air_source(),
                  main_current=cur_track(main_dyn.current()), backup_current=cur_track(backup_pl.current()), live=live.is_ready(), remote=remote.is_ready(), main=main.is_ready(),
                  backup=backup.is_ready(), emergency=emergency.is_ready(), forced=force_fallback(),
                  elapsed=radio.elapsed(), remaining=radio.remaining(), duration=radio.duration(),
                  queue_len=list.length(main_dyn.queue()),
                  upcoming=list.map(fun (r) -> request.uri(r), main_dyn.queue())}))
server.register(namespace="hgc", "queue_len", fun (_) -> string(list.length(main_dyn.queue())))
server.register(namespace="hgc", "upcoming", fun (_) ->
  string.concat(separator="\n", list.map(fun (r) -> request.uri(r), main_dyn.queue())))
server.register(namespace="hgc", "position", fun (_) ->
  "elapsed=#{radio.elapsed()} remaining=#{radio.remaining()} duration=#{radio.duration()}")

server.register(namespace="hgc", "status", fun (_) ->
  "station=#{station} uptime=#{time.up()} live=#{live.is_ready()} remote=#{remote.is_ready()} main=#{main.is_ready()} backup=#{backup.is_ready()} emergency=#{emergency.is_ready()} forced=#{force_fallback()} live_on=#{live_enabled()} remote_on=#{remote_enabled()}")

log.important(label="hgc", "HUNGREE Goat station '#{station}' started (harbor #{harbor_port}, live #{live_port})")
