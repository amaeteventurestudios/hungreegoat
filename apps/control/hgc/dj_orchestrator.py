"""HUNGREE Goat DJ Studio orchestrator.

Runs `python -m hgc.dj_orchestrator <analyze|generate> ...` — a separate process (spawned by
main.py's /api/dj/analyze route, or run manually for the acceptance test) that drives a
headless Chromium via Playwright as the *execution engine* for the real DJ/mastering JS —
never a reimplementation of it. Two jobs:

  analyze  — for each playlist track missing dj_bpm/dj_key, load apps/dj-studio/tools/
             analyze.html (Aurdour's own dj/bpm-worker.js detectBPM/detectKey, called
             directly instead of through a Worker) against the track's real audio, and
             write the result via dj.save_analysis().

  generate — drive the real vendored Aurdour app in ?autopilot=1 mode (see dj-autopilot.js)
             for a real-time FlowMode Auto-DJ session, capture the MediaRecorder's real
             browser-triggered download, convert webm->wav, run it through the vendored
             noisyloop/mastering DSP (apps/dj-studio/vendor/mastering-dsp/render.html) for
             a real offline mastering pass, capture that download too, independently
             re-verify the result with ffprobe/ffmpeg's ebur128 filter (never trusting the
             DSP's own self-reported numbers), and save the mix.

Audio and the whole /dj static app are served unauthenticated (see main.py's /dj mount and
public_api.track_audio) so no session/cookie handling is needed for the analyze step's HTTP
fetches. The /api/dj/manifest the real Aurdour app itself calls (via dj/Library.js) IS behind
the normal operator session like every other /api/dj/* route, though, so `generate`'s browser
context carries a freshly minted session cookie (hgc.auth.issue) purely to let the app load
its own track list — the orchestrator process never sees or needs the operator's password.
The mastering step reads its source WAV over file:// (Chromium launched with
--allow-file-access-from-files) instead of pushing tens of MB through the JS<->Python bridge.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import subprocess
import sys
import time
from pathlib import Path

from . import auth, config, db, dj

BASE_URL = f"http://127.0.0.1:{config.API_PORT}"

MASTERING_PRESETS = {
    # preset -> (target integrated LUFS, true-peak ceiling dBTP)
    "workout_streaming": (-14.0, -1.0),
    "club": (-9.0, -1.0),
    "podcast": (-16.0, -1.0),
    "broadcast": (-14.0, -1.0),
}


def _log(msg: str) -> None:
    print(f"[dj_orchestrator] {msg}", file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# analyze
async def _analyze(station: str, playlist: str) -> int:
    from playwright.async_api import async_playwright

    pending = dj.analysis_pending(station, playlist)
    if not pending:
        _log("nothing pending")
        return 0

    n_ok = 0
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        page = await browser.new_page()
        await page.goto(f"{BASE_URL}/dj/tools/analyze.html")
        await page.wait_for_function("window.__hgcReady === true", timeout=15000)

        for t in pending:
            url = f"{BASE_URL}{t['streamUrl']}"
            try:
                result = await page.evaluate("(u) => window.hgcAnalyze(u)", url)
                bpm = float(result["bpm"]) if result.get("bpm") else None
                # Octave-error safety net (a known BPM-detector failure mode): fold anything
                # outside a plausible track tempo range back into it, rather than trusting an
                # obviously-wrong raw value.
                if bpm:
                    while bpm > 200:
                        bpm /= 2
                    while bpm < 50:
                        bpm *= 2
                dj.save_analysis(int(t["id"]), bpm, result.get("key"), result.get("energy"))
                n_ok += 1
                _log(f"analyzed track {t['id']} ({t['title']}): bpm={bpm} key={result.get('key')}")
            except Exception as e:
                _log(f"analyze failed for track {t['id']} ({t['title']}): {e}")

        await browser.close()
    return n_ok


# ---------------------------------------------------------------------------
# generate
def _ffprobe(path: Path) -> dict:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration,size",
         "-select_streams", "a:0", "-show_entries", "stream=sample_rate,channels,codec_name",
         "-of", "json", str(path)],
        capture_output=True, text=True, timeout=60)
    probe = json.loads(r.stdout or "{}")
    if r.returncode != 0 or not probe.get("streams"):
        raise RuntimeError(f"ffprobe failed for {path}: {r.stderr[-500:]}")
    fmt, stream = probe.get("format") or {}, probe["streams"][0]
    return {
        "duration": float(fmt.get("duration") or 0),
        "size": int(fmt.get("size") or 0),
        "sample_rate": int(stream.get("sample_rate") or 0),
        "channels": int(stream.get("channels") or 0),
        "codec": stream.get("codec_name"),
    }


def _measure_ebur128(path: Path) -> dict:
    """Independent loudness/true-peak verification via ffmpeg's own ebur128 filter — this is
    deliberately NOT the mastering DSP's self-reported numbers, per the acceptance mandate."""
    r = subprocess.run(
        ["ffmpeg", "-nostdin", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True, text=True, timeout=120)
    out = r.stderr
    # The filter prints an "I:"/per-block loudness value on every ~100ms progress line as it
    # streams through the file, THEN a final "Integrated loudness: I: ... LUFS" summary block
    # at the very end — re.search would grab the first (an early, meaningless partial-window
    # reading) instead of that final summary, so every match is collected and the last (the
    # summary) is the one actually used.
    i_matches = re.findall(r"I:\s*(-?\d+(?:\.\d+)?)\s*LUFS", out)
    peak_matches = re.findall(r"Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS", out)
    if not i_matches:
        raise RuntimeError(f"ebur128 parse failed: {out[-800:]}")
    return {
        "integrated_lufs": float(i_matches[-1]),
        "true_peak_db": float(peak_matches[-1]) if peak_matches else None,
    }


def _convert_webm_to_wav(src: Path, dest: Path) -> None:
    r = subprocess.run(
        ["ffmpeg", "-y", "-nostdin", "-i", str(src), "-ar", "44100", "-ac", "2", "-sample_fmt", "s16", str(dest)],
        capture_output=True, text=True, timeout=300)
    if r.returncode != 0 or not dest.is_file():
        raise RuntimeError(f"ffmpeg webm->wav failed: {r.stderr[-800:]}")


def _loudnorm_correct(src: Path, dest: Path, target_lufs: float, ceiling_db: float) -> None:
    """Corrective final loudness pass using ffmpeg's own (industry-standard, independently
    trustworthy) two-pass loudnorm — NOT the vendored DSP's self-measurement. Smoke-testing
    this pipeline found the vendored mastering DSP's own measureLUFS/limiter can land several
    LU off its own stated target (confirmed by ffmpeg's ebur128 on the same file), so the DSP
    chain is used only for its creative processing (compression/saturation/EQ character) and
    this ffmpeg pass is what actually delivers the acceptance-mandated LUFS/true-peak numbers."""
    measure = subprocess.run(
        ["ffmpeg", "-nostdin", "-i", str(src), "-af",
         f"loudnorm=I={target_lufs}:TP={ceiling_db}:LRA=11:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True, timeout=180)
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", measure.stderr, re.S)
    if not m:
        raise RuntimeError(f"loudnorm measure pass failed to report stats: {measure.stderr[-800:]}")
    stats = json.loads(m.group(0))
    apply_filter = (
        f"loudnorm=I={target_lufs}:TP={ceiling_db}:LRA=11:"
        f"measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:"
        f"measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:"
        f"offset={stats.get('target_offset', 0)}:linear=true:print_format=summary"
    )
    r = subprocess.run(
        ["ffmpeg", "-y", "-nostdin", "-i", str(src), "-af", apply_filter,
         "-ar", "44100", "-sample_fmt", "s16", str(dest)],
        capture_output=True, text=True, timeout=180)
    if r.returncode != 0 or not dest.is_file():
        raise RuntimeError(f"loudnorm apply pass failed: {r.stderr[-800:]}")


async def _wait_autopilot_done(page, timeout_sec: float):
    deadline = time.time() + timeout_sec
    last_phase = None
    while time.time() < deadline:
        state = await page.evaluate("window.__hgcAutopilot || null")
        if state is None:
            await asyncio.sleep(0.5)
            continue
        if state["phase"] != last_phase:
            _log(f"autopilot phase: {state['phase']} (elapsed={state.get('elapsed', 0):.1f}s)")
            last_phase = state["phase"]
        if state["phase"] in ("stopped", "error"):
            return state
        await asyncio.sleep(1.0)
    raise TimeoutError("autopilot did not finish within timeout")


# Musically chosen from listening to the real catalog (see the CRITICAL tempo-acceleration
# report) — a workout at "moderate" wants a real but gentle lift; "intense" is the range the
# owner manually dialed in on the full console (+50%) and liked. Only used to resolve
# tempo_mode="automatic"; every other mode is an explicit operator choice.
INTENSITY_BOOST_PCT = {"easy": 0, "moderate": 25, "high": 50, "intense": 75}


def _resolve_tempo(tempo_mode: str, intensity: str, tempo_boost_pct: float | None, target_bpm: float | None):
    """Turns the request-time tempo choice into the concrete (mode, boost_pct, target_bpm)
    the browser side actually applies — 'automatic' and 'custom' are resolved here, never
    passed through, so dj-autopilot.js only ever has to handle 'original'/'boost'/'target_bpm'."""
    if tempo_mode == "original":
        return "original", 0.0, None
    if tempo_mode == "target_bpm":
        if not target_bpm or target_bpm <= 0:
            raise ValueError("target_bpm mode requires a positive target_bpm")
        return "target_bpm", None, float(target_bpm)
    if tempo_mode in ("boost", "custom"):
        pct = float(tempo_boost_pct) if tempo_boost_pct is not None else 0.0
        return "boost", pct, None
    # "automatic" (or anything unrecognized — fail toward the safe/original behavior's sibling
    # rather than toward an unexpectedly large, unrequested boost)
    return "boost", float(INTENSITY_BOOST_PCT.get(intensity, 25)), None


async def _generate(mid: int, station: str, playlist: str, duration: float,
                     transition_sec: float, transition_type: str,
                     tempo_mode: str = "automatic", tempo_boost_pct: float | None = None,
                     target_bpm: float | None = None, key_lock: bool = True) -> dict:
    from playwright.async_api import async_playwright

    m = dj.mix_get(mid)
    if not m:
        raise KeyError(f"no such mix {mid}")

    resolved_mode, resolved_boost, resolved_target = _resolve_tempo(tempo_mode, m.get("intensity") or "moderate", tempo_boost_pct, target_bpm)
    _log(f"tempo: requested mode={tempo_mode} -> resolved mode={resolved_mode} boost_pct={resolved_boost} target_bpm={resolved_target} key_lock={key_lock}")

    dj.mix_set_status(mid, "recording", tempo_mode=resolved_mode, tempo_boost_pct=resolved_boost, target_bpm=resolved_target)
    dj.ensure_dirs()

    raw_webm = config.MIXES_RAW_DIR / f"mix-{mid}-raw.webm"
    raw_wav = config.MIXES_RAW_DIR / f"mix-{mid}-raw.wav"
    dsp_wav = config.MIXES_RAW_DIR / f"mix-{mid}-dsp.wav"
    mastered_wav = config.MIXES_DIR / f"mix-{mid}.wav"

    recipe_raw, actual_duration = [], None

    # --- Stage 1: real-time record via the real Auto-DJ engine -----------------------------
    async with async_playwright() as p:
        # channel="chromium" forces Playwright's full Chrome binary rather than its default
        # chrome-headless-shell for a plain headless launch() — measured directly on this Pi:
        # the shell variant's <audio>-element pipeline produced near-total silence (a captured
        # peak of 0) despite the deck reporting isPlaying/ctx.state=running, while the full
        # browser produces real, audible, correctly-paced playback. Real-time recording is
        # inherently wall-clock-bound and CPU-sensitive — this stage is the one place in the
        # pipeline that actually needs it.
        browser = await p.chromium.launch(channel="chromium", args=["--autoplay-policy=no-user-gesture-required"])
        context = await browser.new_context(accept_downloads=True)
        # dj/Library.js (the real, unmodified-behavior Aurdour loader) fetches
        # /api/dj/manifest, an ordinary Depends(current_user) route like the rest of
        # /api/dj/* — mint this run its own short-lived operator session cookie so the app
        # loads its real track list exactly as it would for a signed-in operator.
        await context.add_cookies([{"name": auth.COOKIE, "value": auth.issue("dj-orchestrator"),
                                     "url": BASE_URL}])
        page = await context.new_page()
        downloads: list = []
        page.on("download", lambda d: downloads.append(d))

        # Real-time headless recording on this Pi consistently lands short of the requested
        # wall-clock duration under normal production load (measured directly, not assumed:
        # three independent 300s-target runs came back at 250.9s/83.6%, 257.8s/85.9%, and
        # 241.1s/80.4% with tempo acceleration active — tempo's extra per-sample time-stretch
        # work makes the shortfall worse, not better). REC_PADDING requests MORE wall-clock
        # recording time than asked for to compensate, and Stage 2 below trims the result back
        # down to the real target if it overshoots — this is deliberately NOT presented as an
        # exact fix (the shortfall ratio varies with live system load, ~80-86% observed, not a
        # single stable constant), only as a measured, disclosed mitigation; see docs/dj-studio.md
        # for the deterministic/offline-rendering path that would remove this class of error
        # entirely.
        REC_PADDING = 1.25
        recording_duration = duration * REC_PADDING
        url = (f"{BASE_URL}/dj/index.html?autopilot=1&duration={recording_duration}"
               f"&transitionSec={transition_sec}&transitionType={transition_type}"
               f"&tempoMode={resolved_mode}&tempoBoostPct={resolved_boost or 0}"
               f"&targetBpm={resolved_target or ''}&keyLock={1 if key_lock else 0}")
        await page.goto(url)

        state = await _wait_autopilot_done(page, timeout_sec=recording_duration + 180)
        if state["phase"] == "error":
            raise RuntimeError(f"autopilot error: {state.get('error')}")

        recipe_raw = state.get("recipe") or []
        actual_duration = state.get("actualDurationSec")

        # _saveRecording() fires the mix download and (if any track changes were logged) a
        # cue-sheet download; wait briefly for both to land, then take the audio one.
        deadline = time.time() + 15
        while time.time() < deadline and not any(d.suggested_filename.endswith((".webm", ".ogg", ".mp4"))
                                                    for d in downloads):
            await asyncio.sleep(0.5)
        audio_dl = next((d for d in downloads if d.suggested_filename.endswith((".webm", ".ogg", ".mp4"))), None)
        if not audio_dl:
            raise RuntimeError(f"no audio download captured (got: {[d.suggested_filename for d in downloads]})")
        await audio_dl.save_as(str(raw_webm))
        await context.close()
        await browser.close()

    _log(f"recorded raw mix: {raw_webm} ({raw_webm.stat().st_size} bytes)")
    dj.mix_set_status(mid, "mastering", actual_duration_sec=actual_duration, engine_version=dj.ENGINE_VERSION)

    # --- Stage 2: webm -> wav, then trim back to the real requested duration if the padded
    # recording (see REC_PADDING above) overshot it, with a short fade so the cut is never
    # abrupt. Left alone (not trimmed further) if it still came in under target even with
    # the padding — that shortfall is real and reported via actual_duration_sec, not hidden.
    _convert_webm_to_wav(raw_webm, raw_wav)
    raw_probe = _ffprobe(raw_wav)
    _log(f"raw wav (pre-trim): {raw_probe}")
    if raw_probe["duration"] > duration + 1.0:
        trimmed = config.MIXES_RAW_DIR / f"mix-{mid}-raw-trimmed.wav"
        fade_start = max(0.0, duration - 2.0)
        r = subprocess.run(
            ["ffmpeg", "-y", "-nostdin", "-i", str(raw_wav), "-t", str(duration),
             "-af", f"afade=t=out:st={fade_start}:d={duration - fade_start}",
             "-ar", "44100", "-ac", "2", str(trimmed)],
            capture_output=True, text=True, timeout=120)
        if r.returncode == 0 and trimmed.is_file():
            trimmed.replace(raw_wav)
            raw_probe = _ffprobe(raw_wav)
            _log(f"raw wav (trimmed to target + fade): {raw_probe}")
        else:
            _log(f"trim pass failed, keeping untrimmed recording: {r.stderr[-500:]}")

    # --- Stage 3: offline mastering via the real vendored DSP -------------------------------
    # render.html is loaded over HTTP (like the analyze step) rather than file:// — Chromium's
    # fetch() implementation does not reliably support the file: scheme even with
    # --allow-file-access-from-files (confirmed by a real failure here: "TypeError: Failed to
    # fetch" from inside hgcMaster). The raw WAV itself still never touches the network: a
    # Playwright route intercepts the one fetch() call the page makes for it and fulfills the
    # response directly from the local file on disk.
    target_lufs, ceiling_db = MASTERING_PRESETS.get(m.get("mastering_preset") or "", (-14.0, -1.0))
    source_url = f"{BASE_URL}/__dj_orchestrator_raw_source__/{mid}.wav"
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()
        downloads: list = []
        page.on("download", lambda d: downloads.append(d))
        await page.route(source_url, lambda route: route.fulfill(path=str(raw_wav)))

        # The offline mastering pass on a multi-minute buffer runs pure JS math on this Pi's
        # ARM CPU (no native/WASM acceleration) — a single ~3-minute track alone can take well
        # over Playwright's 30s default evaluate() timeout, so raise it generously up front.
        page.set_default_timeout(900000)
        await page.goto(f"{BASE_URL}/dj/vendor/mastering-dsp/render.html")
        await page.wait_for_function("window.__hgcReady === true", timeout=15000)

        master_result = await page.evaluate(
            "(a) => window.hgcMaster(a.url, a.opts)",
            {"url": source_url, "opts": {"targetLufs": target_lufs, "ceilingDb": ceiling_db,
                                          "downloadName": f"mix-{mid}.wav"}},
        )
        deadline = time.time() + 30
        while time.time() < deadline and not downloads:
            await asyncio.sleep(0.5)
        if not downloads:
            raise RuntimeError("no mastered-audio download captured")
        await downloads[0].save_as(str(dsp_wav))
        await context.close()
        await browser.close()

    _log(f"mastering DSP self-report (not trusted — corrected below): {master_result}")

    # --- Stage 4: corrective loudness pass + independent verification ------------------------
    # The DSP chain (Stage 3) supplies the creative processing; this ffmpeg pass is what
    # actually delivers the acceptance-mandated LUFS/true-peak numbers (see _loudnorm_correct).
    _loudnorm_correct(dsp_wav, mastered_wav, target_lufs, ceiling_db)
    probe = _ffprobe(mastered_wav)
    loud = _measure_ebur128(mastered_wav)
    _log(f"independent verification: probe={probe} ebur128={loud}")

    recipe_rows = [
        {
            "track_id": int(r["id"]), "deck": r.get("deck", "A" if i % 2 == 0 else "B"),
            "source_bpm": r.get("bpm"), "effective_bpm": r.get("effectiveBpm", r.get("bpm")),
            "tempo_adjust_pct": round((r.get("tempoMultiplier", 1) - 1) * 100, 2),
            "key_lock": bool(r.get("keyLock", key_lock)),
            "source_key": r.get("key"),
            "start_offset_sec": r.get("startedAtSec", 0),
            "end_offset_sec": None, "transition_in_sec": r.get("startedAtSec", 0),
            "transition_duration_sec": transition_sec,
        }
        for i, r in enumerate(recipe_raw)
    ]
    dj.mix_set_recipe(mid, recipe_rows)

    updated = dj.mix_set_status(
        mid, "ready",
        filename=mastered_wav.name, raw_filename=raw_wav.name,
        actual_duration_sec=probe["duration"], sample_rate=probe["sample_rate"],
        bit_depth=16, audio_format="wav", file_size=probe["size"],
        target_lufs=target_lufs, measured_lufs=loud["integrated_lufs"],
        measured_true_peak_db=loud["true_peak_db"], engine_version=dj.ENGINE_VERSION,
    )
    db.log_event("info", "system", f"DJ mix ready: {updated['title']} "
                                    f"({probe['duration']:.0f}s, {loud['integrated_lufs']:.1f} LUFS)", station)
    return {
        "mix": updated, "recipe": recipe_rows, "raw_probe": raw_probe,
        "probe": probe, "verification": loud, "dsp_self_report": master_result,
    }


# ---------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("analyze")
    a.add_argument("--station", default="lofi")
    a.add_argument("--playlist", default="workout")

    g = sub.add_parser("generate")
    g.add_argument("--mix-id", type=int, required=True)
    g.add_argument("--station", default="lofi")
    g.add_argument("--playlist", default="workout")
    g.add_argument("--duration", type=float, default=300)
    g.add_argument("--transition-sec", type=float, default=8)
    g.add_argument("--transition-type", default="blend")
    g.add_argument("--tempo-mode", default="automatic", choices=["automatic", "original", "boost", "target_bpm", "custom"])
    g.add_argument("--tempo-boost-pct", type=float, default=None)
    g.add_argument("--target-bpm", type=float, default=None)
    g.add_argument("--key-lock", type=int, default=1)

    args = ap.parse_args()

    if args.cmd == "analyze":
        n = asyncio.run(_analyze(args.station, args.playlist))
        print(json.dumps({"analyzed": n}))
        return 0

    if args.cmd == "generate":
        try:
            result = asyncio.run(_generate(args.mix_id, args.station, args.playlist,
                                            args.duration, args.transition_sec, args.transition_type,
                                            args.tempo_mode, args.tempo_boost_pct, args.target_bpm, bool(args.key_lock)))
        except Exception as e:
            _log(f"generate failed: {e}")
            try:
                dj.mix_set_status(args.mix_id, "failed", notes=str(e)[:500])
            except Exception:
                pass
            raise
        print(json.dumps({k: v for k, v in result.items() if k != "dsp_self_report"}, default=str))
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
