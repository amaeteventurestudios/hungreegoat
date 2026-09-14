"""Client for the Liquidsoap unix control socket (never exposed to the network)."""
from __future__ import annotations
import re
import socket
import threading
from pathlib import Path

from . import config

_locks: dict[str, threading.Lock] = {s: threading.Lock() for s in config.STATION_IDS}


class LiqError(RuntimeError):
    pass


def command(sid: str, cmd: str, timeout: float = 3.0) -> str:
    path = config.station(sid)["liq_socket"]
    if not Path(path).exists():
        raise LiqError("liquidsoap socket not present")
    with _locks[sid]:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(timeout)
        try:
            s.connect(path)
            s.sendall((cmd + "\n").encode())
            buf = b""
            while not buf.endswith(b"\r\nEND\r\n") and not buf.endswith(b"\nEND\n"):
                chunk = s.recv(65536)
                if not chunk:
                    break
                buf += chunk
            try:
                s.sendall(b"quit\n")
            except OSError:
                pass
        except (OSError, socket.timeout) as e:
            raise LiqError(str(e)) from e
        finally:
            s.close()
    text = buf.decode(errors="replace")
    text = re.sub(r"\r?\nEND\r?\n$", "", text)
    return text.strip()


_state_cache: dict[str, tuple[float, dict]] = {}


def state(sid: str, max_age: float = 1.0) -> dict:
    """Combined status/position/queue in one round-trip, cached briefly so the
    dashboard, meter and watchdog don't each hit the socket."""
    import json as _j, time as _t
    c = _state_cache.get(sid)
    if c and _t.time() - c[0] < max_age:
        return c[1]
    try:
        d = _j.loads(command(sid, "hgc.state"))
        d["alive"] = True
        for k in ("elapsed", "remaining", "duration"):
            v = d.get(k)
            d[k] = v if isinstance(v, (int, float)) and v == v and v < 1e9 else None
        d["prepared"] = []
        for uri in d.pop("upcoming", []) or []:
            m = re.search(r'hgc_track_id="(\d+)"', uri)
            d["prepared"].append({"track_id": int(m.group(1)) if m else None, "uri": uri.rsplit(":", 1)[-1]})
    except (LiqError, ValueError) as e:
        d = {"alive": False, "error": str(e), "prepared": []}
    _state_cache[sid] = (_t.time(), d)
    return d


def alive(sid: str) -> bool:
    return bool(state(sid).get("alive"))


def status(sid: str) -> dict:
    d = state(sid)
    if not d.get("alive"):
        return {"error": d.get("error", "down")}
    return {k: ("true" if v is True else "false" if v is False else str(v)) for k, v in d.items()
            if k in ("uptime", "live", "remote", "main", "backup", "emergency", "forced")}


def set_var(sid: str, name: str, value) -> str:
    if isinstance(value, bool):
        v = "true" if value else "false"
    elif isinstance(value, (int, float)):
        v = repr(float(value))
    else:
        v = '"' + str(value).replace('"', '\\"') + '"'
    return command(sid, f"var.set {name} = {v}")


def skip(sid: str) -> str:
    return command(sid, "hgc.skip")


def remaining(sid: str) -> float | None:
    return position(sid).get("remaining")


def position(sid: str) -> dict:
    """Live elapsed/remaining/duration of the track on air, straight from Liquidsoap."""
    d = state(sid)
    return {k: d.get(k) for k in ("elapsed", "remaining", "duration")} if d.get("alive") else {}


def on_air_metadata(sid: str) -> dict:
    try:
        raw = command(sid, "out.metadata")
    except LiqError:
        return {}
    # last block is the current track
    blocks = [b for b in re.split(r"--- \d+ ---", raw) if b.strip()]
    if not blocks:
        return {}
    md = {}
    for line in blocks[-1].strip().splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            md[k.strip()] = v.strip().strip('"')
    return md


def queue_len(sid: str) -> int:
    d = state(sid, max_age=0.0)
    return int(d.get("queue_len", -1)) if d.get("alive") else -1


def wait_ready(sid: str, timeout: float = 3.0) -> bool:
    """Block until Liquidsoap has at least one resolved request queued (after a requeue)."""
    import time as _t
    end = _t.time() + timeout
    while _t.time() < end:
        if queue_len(sid) > 0:
            return True
        _t.sleep(0.2)
    return False


def requeue(sid: str) -> list[int]:
    """Drop the prefetched requests so the next fetch reflects the queue.
    Returns the track ids that were dropped (the caller re-queues any operator requests)."""
    dropped = [p["track_id"] for p in upcoming_prepared(sid) if p["track_id"]]
    command(sid, "hgc.requeue")
    return dropped


def upcoming_prepared(sid: str) -> list[dict]:
    """Requests Liquidsoap has already prepared (annotate URIs → track ids)."""
    return list(state(sid, max_age=0.0).get("prepared", []))


def rms(sid: str) -> float | None:
    """Current RMS level (0..1) of the on-air signal."""
    try:
        v = command(sid, "meter.rms", timeout=1.0).split()
        return float(v[0]) if v else None
    except (LiqError, ValueError):
        return None


def uptime(sid: str) -> str | None:
    try:
        return command(sid, "uptime")
    except LiqError:
        return None
