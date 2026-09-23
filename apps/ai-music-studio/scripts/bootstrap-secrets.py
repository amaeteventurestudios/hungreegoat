#!/usr/bin/env python3
"""Provision an encrypted-secret directory and key without overwriting either."""
import base64
import os
from pathlib import Path
import secrets
import stat

root = Path(__file__).resolve().parents[1]
environment_file = root / '.env'
contents = environment_file.read_text()
settings = dict(line.split('=', 1) for line in contents.splitlines()
                if line and not line.startswith('#') and '=' in line)
if settings.get('STUDIO_ENV') != 'development':
    raise SystemExit('This helper provisions only local development secrets.')
directory = Path(settings.get('STUDIO_SECRET_DIRECTORY') or str(Path.home() / '.local/share/hg-studio/dev/secrets'))
if not directory.is_absolute() or any(path.is_symlink() for path in (directory, *directory.parents)):
    raise SystemExit('Secret directory must be absolute and have no symlink components.')
directory.mkdir(parents=True, exist_ok=True, mode=0o700)
if stat.S_IMODE(directory.stat().st_mode) != 0o700:
    raise SystemExit('Secret directory must be private (0700) and not a symlink.')
values = directory / 'values'
values.mkdir(exist_ok=True, mode=0o700)
if values.is_symlink() or not values.is_dir() or stat.S_IMODE(values.stat().st_mode) != 0o700:
    raise SystemExit('Encrypted value directory must be private (0700) and not a symlink.')
key_file = directory / 'fernet.key'
if key_file.exists():
    if key_file.is_symlink() or not key_file.is_file() or stat.S_IMODE(key_file.stat().st_mode) != 0o600:
        raise SystemExit('Encryption key must be a private regular file (0600).')
    if len(base64.urlsafe_b64decode(key_file.read_bytes())) != 32:
        raise SystemExit('Existing encryption key is invalid; never replace it automatically.')
else:
    descriptor = os.open(key_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'wb') as handle:
        handle.write(base64.urlsafe_b64encode(secrets.token_bytes(32)))
if 'STUDIO_SECRET_DIRECTORY' not in settings:
    with environment_file.open('a') as handle:
        handle.write(f'\nSTUDIO_SECRET_DIRECTORY={directory}\n')
print('Private encrypted-secret storage provisioned; existing key material preserved.')
