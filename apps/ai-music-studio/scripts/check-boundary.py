#!/usr/bin/env python3
"""Check the captured run baseline without touching protected repository files."""
import hashlib
import json
from pathlib import Path
import subprocess

studio = Path(__file__).resolve().parents[1]
root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], cwd=studio, text=True).strip())
assert root == studio.parents[1], 'Studio must use parent monorepo'
assert not (studio / '.git').exists(), 'Nested repository detected'
baseline_path = Path('/tmp/studio-autonomous-baseline.json')
if not baseline_path.exists():
    raise SystemExit('No captured baseline; create it before changing source.')
baseline = json.loads(baseline_path.read_text())
changed = [name for name, digest in baseline.items()
           if not (root / name).is_file()
           or hashlib.sha256((root / name).read_bytes()).hexdigest() != digest]
if changed:
    raise SystemExit(f'Outside-Studio changes since baseline: {changed}')
staged = subprocess.check_output(['git', 'diff', '--cached', '--name-only'], cwd=root, text=True).splitlines()
assert all(name.startswith('apps/ai-music-studio/') for name in staged), 'Unrelated staged changes'
print(f'Boundary verified: {len(baseline)} original outside-Studio files unchanged; index scoped.')
