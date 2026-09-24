#!/usr/bin/env python3
"""Run an isolated restore check against the newest complete Studio backup."""

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--backup-root", required=True, type=Path)
parser.add_argument("--passphrase-file", required=True, type=Path)
args = parser.parse_args()
candidates = sorted(
    (path for path in args.backup_root.glob("studio-*") if path.is_dir() and (path / "manifest.json").is_file()),
    reverse=True,
)
if not candidates:
    raise SystemExit("No completed Studio backup is available for restore verification")
command = [
    sys.executable,
    str(ROOT / "scripts/backup-studio.py"),
    "verify",
    "--backup-root",
    str(args.backup_root),
    "--backup-directory",
    str(candidates[0]),
    "--passphrase-file",
    str(args.passphrase_file),
    "--restore-test",
]
raise SystemExit(subprocess.run(command, env=os.environ.copy(), check=False).returncode)
