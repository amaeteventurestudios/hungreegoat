#!/usr/bin/env python3
"""Create private development orchestration material without replacing credentials."""
import os
from pathlib import Path
import secrets
import stat

root = Path(__file__).resolve().parents[1]
env_file = root / '.env'
contents = env_file.read_text()
config = dict(line.split('=', 1) for line in contents.splitlines()
              if line and not line.startswith('#') and '=' in line)
if config.get('STUDIO_ENV') != 'development':
    raise SystemExit('This helper provisions only local development orchestration.')
directory = Path(config.get('STUDIO_ORCHESTRATION_DIRECTORY') or
                 str(Path.home() / '.local/share/hg-studio/dev/orchestration'))
if not directory.is_absolute() or any(p.is_symlink() for p in (directory, *directory.parents)):
    raise SystemExit('Orchestration directory must be absolute without symlink components.')
directory.mkdir(parents=True, mode=0o700, exist_ok=True)
if stat.S_IMODE(directory.stat().st_mode) != 0o700:
    raise SystemExit('Orchestration directory must be mode 0700.')
for name in ('worker-token', 'bootstrap-token', 'windmill-token', 'script-hash'):
    path = directory / name
    if path.exists():
        if path.is_symlink() or not path.is_file() or stat.S_IMODE(path.stat().st_mode) != 0o600:
            raise SystemExit('Orchestration files must be private regular files (0600).')
        continue
    value = '' if name in ('windmill-token', 'script-hash') else secrets.token_hex(32)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as handle:
        handle.write(value)
updates = {}
if 'STUDIO_ORCHESTRATION_DIRECTORY' not in config:
    updates['STUDIO_ORCHESTRATION_DIRECTORY'] = str(directory)
if 'STUDIO_WINDMILL_DB_PASSWORD' not in config:
    updates['STUDIO_WINDMILL_DB_PASSWORD'] = secrets.token_hex(32)
with env_file.open('a') as handle:
    for name, value in updates.items():
        handle.write(f'\n{name}={value}\n')
print('Private orchestration configuration prepared; existing material preserved.')
