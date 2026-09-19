"""Control of the user-level systemd units that make up the station stack."""
from __future__ import annotations
import os
import subprocess

from . import config

UNITS = {
    "control": "hungree-goat-control.service",
    "liquidsoap": "hungree-goat-liquidsoap@{sid}.service",
    "stream": "hungree-goat-stream@{sid}.service",
}
ALLOWED_ACTIONS = {"start", "stop", "restart"}


def _env() -> dict:
    env = dict(os.environ)
    env.setdefault("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
    env.setdefault("DBUS_SESSION_BUS_ADDRESS", f"unix:path=/run/user/{os.getuid()}/bus")
    return env


def unit(kind: str, sid: str | None = None) -> str:
    return UNITS[kind].format(sid=sid)


def systemctl(*args: str, timeout: int = 30) -> subprocess.CompletedProcess:
    return subprocess.run(["systemctl", "--user", *args], capture_output=True, text=True, timeout=timeout, env=_env())


def state(kind: str, sid: str | None = None) -> dict:
    u = unit(kind, sid)
    r = systemctl("show", u, "-p",
                  "ActiveState,SubState,UnitFileState,NRestarts,ExecMainStartTimestampMonotonic,ActiveEnterTimestamp,"
                  "MainPID,Restart,RestartUSec")
    out = {"unit": u}
    for line in r.stdout.splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            out[k] = v
    out["active"] = out.get("ActiveState") == "active"
    out["enabled"] = out.get("UnitFileState") in ("enabled", "static", "enabled-runtime")
    # Whether the unit actually has a crash-restart policy configured (Restart=always /
    # on-failure / etc, as opposed to the default "no") — the real signal for "is this
    # service's auto-recovery armed", as distinct from `enabled` above (which only means
    # "will systemd start this at boot", not "will it come back if it dies while running").
    out["auto_restart"] = out.get("Restart") not in (None, "no")
    return out


def action(kind: str, act: str, sid: str | None = None) -> dict:
    if act not in ALLOWED_ACTIONS:
        raise ValueError("invalid action")
    u = unit(kind, sid)
    r = systemctl(act, u, timeout=60)
    return {"unit": u, "action": act, "ok": r.returncode == 0, "stderr": r.stderr.strip()[:500]}


def journal(unit_name: str, lines: int = 200) -> list[str]:
    r = subprocess.run(["journalctl", f"--user-unit={unit_name}", "-n", str(lines), "--no-pager", "-o", "short-iso"],
                       capture_output=True, text=True, timeout=20, env=_env())
    return r.stdout.splitlines()


REPAIR_BIN = "/usr/local/sbin/hgc-usb-repair"


def usb_repair_available() -> bool:
    """True when the root-owned repair helper is installed and sudo allows it without a password."""
    if not os.path.exists(REPAIR_BIN):
        return False
    r = subprocess.run(["sudo", "-n", "-l", REPAIR_BIN], capture_output=True, text=True, timeout=10)
    return r.returncode == 0


REPAIR_UNIT = "hgc-usb-repair"


def usb_repair() -> dict:
    """Launch the repair as a transient user unit so it survives the control-service
    restart it performs itself. Progress is read back from its journal."""
    if repair_running():
        return {"ok": True, "started": False, "running": True}
    r = subprocess.run(["systemd-run", "--user", "--collect", f"--unit={REPAIR_UNIT}", "--description=HUNGREE-GOAT drive repair",
                        "sudo", "-n", REPAIR_BIN], capture_output=True, text=True, timeout=30, env=_env())
    return {"ok": r.returncode == 0, "started": r.returncode == 0, "rc": r.returncode, "output": (r.stdout + r.stderr)[-1000:]}


def repair_running() -> bool:
    r = systemctl("is-active", REPAIR_UNIT + ".service")
    return r.stdout.strip() in ("active", "activating")


def repair_log(lines: int = 40) -> list[str]:
    return journal(REPAIR_UNIT + ".service", lines)
