#!/usr/bin/env python3
"""Provision a local owner via the private API CLI without printing credentials."""
import json
import os
from pathlib import Path
import secrets
import stat
import subprocess

root = Path(__file__).resolve().parents[1]
env_file = Path(os.environ.get('STUDIO_COMPOSE_ENV_FILE', str(root / '.env')))
if not env_file.is_absolute() or env_file.is_symlink():
    raise SystemExit('Studio environment path must be an absolute regular file.')
settings = dict(line.split('=', 1) for line in env_file.read_text().splitlines()
                if line and not line.startswith('#') and '=' in line)
if settings.get('STUDIO_ENV') not in {'development', 'production'}:
    raise SystemExit('This helper provisions only an isolated Studio environment.')
if settings.get('STUDIO_ENV') == 'production' and (settings.get('COMPOSE_PROJECT_NAME') != 'hg-studio-prod' or settings.get('STUDIO_PUBLIC_URL') != 'https://studio.hungreegoat.com'):
    raise SystemExit('Production Studio configuration is not isolated or has the wrong origin.')
directory = env_file.parent if settings['STUDIO_ENV'] == 'production' else Path.home() / '.local/share/hg-studio/dev'
directory.mkdir(parents=True, exist_ok=True, mode=0o700)
if directory.is_symlink() or stat.S_IMODE(directory.stat().st_mode) != 0o700:
    raise SystemExit('Studio credential directory must be private mode 0700 and not a symlink.')
target = directory / 'owner.json'
if target.exists():
    if target.is_symlink() or target.stat().st_mode & 0o077:
        raise SystemExit('Owner credential file must have mode 0600.')
    owner = json.loads(target.read_text())
else:
    owner = {'email': 'owner@studio.local' if settings['STUDIO_ENV'] == 'development' else 'owner@studio.hungreegoat.com', 'password': secrets.token_urlsafe(32)}
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as handle:
        json.dump(owner, handle)
command = ['bash', str(root / 'scripts/compose.sh'), 'exec', '-T', 'studio-api',
           'python', '-m', 'studio_api.bootstrap', '--email', owner['email'],
           '--display-name', 'Studio owner', '--workspace-name', 'My studio']
result = subprocess.run(command, input=owner['password'] + '\n', text=True)
if result.returncode:
    # The bootstrap CLI emits sanitized diagnostics and never prints the password.
    raise SystemExit('Owner provisioning refused or failed; see CLI diagnostics above. Existing users are never replaced.')
print('Studio owner provisioned. Private credentials are stored in ' + str(target))
