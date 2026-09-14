"""Real system metrics from the Pi. Nothing here is decorative."""
from __future__ import annotations
import os
import shutil
import subprocess
import time

import psutil

from . import config

_boot = psutil.boot_time()


def cpu_temp() -> float | None:
    try:
        return int(open("/sys/class/thermal/thermal_zone0/temp").read()) / 1000.0
    except Exception:
        return None


def throttled() -> dict:
    """Decode vcgencmd get_throttled bits."""
    out = {"raw": None, "under_voltage": None, "throttled": None, "freq_capped": None, "ok": None}
    try:
        r = subprocess.run(["vcgencmd", "get_throttled"], capture_output=True, text=True, timeout=3)
        v = int(r.stdout.strip().split("=")[1], 16)
        out.update(raw=hex(v), under_voltage=bool(v & 0x1), freq_capped=bool(v & 0x2), throttled=bool(v & 0x4),
                   under_voltage_ever=bool(v & 0x10000), throttled_ever=bool(v & 0x40000), ok=(v & 0x7) == 0)
    except Exception:
        pass
    return out


def usb() -> dict:
    p = str(config.MEDIA)
    out = {"path": p, "mounted": os.path.ismount(p)}
    if out["mounted"]:
        try:
            for line in open("/proc/mounts"):
                parts = line.split()
                if len(parts) > 3 and parts[1] == p:
                    out["device"] = parts[0]
                    out["fs_shutdown"] = "shutdown" in parts[3].split(",")
        except OSError:
            pass
        try:
            du = shutil.disk_usage(p)
        except OSError as e:
            out.update(writable=False, error=f"I/O error: {e}", total=0, used=0, free=0, percent=0)
            return out
        out.update(total=du.total, used=du.used, free=du.free, percent=round(du.used / du.total * 100, 1))
        try:
            probe = config.MEDIA / ".hgc-write-test"
            probe.write_text(str(time.time()))
            probe.unlink()
            out["writable"] = True
        except Exception as e:
            out["writable"] = False
            out["error"] = str(e)
    return out


def snapshot() -> dict:
    vm = psutil.virtual_memory()
    root = shutil.disk_usage("/")
    la = os.getloadavg()
    return {
        "ts": time.time(),
        "hostname": os.uname().nodename,
        "cpu_percent": psutil.cpu_percent(interval=None),
        "cpu_per_core": psutil.cpu_percent(interval=None, percpu=True),
        "load": [round(x, 2) for x in la],
        "cores": psutil.cpu_count(),
        "ram": {"total": vm.total, "used": vm.used, "available": vm.available, "percent": vm.percent},
        "root_disk": {"total": root.total, "used": root.used, "free": root.free,
                      "percent": round(root.used / root.total * 100, 1)},
        "usb": usb(),
        "temp_c": cpu_temp(),
        "throttle": throttled(),
        "uptime_sec": int(time.time() - _boot),
    }


# prime psutil's cpu_percent so the first real call has a baseline
psutil.cpu_percent(interval=None)
