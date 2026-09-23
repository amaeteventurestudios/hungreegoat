#!/usr/bin/env python3
"""Provision a local owner via the private API CLI without printing credentials."""
import json
import os
from pathlib import Path
import secrets
import subprocess

root = Path(__file__).resolve().parents[1]
settings = dict(line.split('=', 1) for line in (root / '.env').read_text().splitlines()
                if line and not line.startswith('#') and '=' in line)
if settings.get('STUDIO_ENV') != 'development':
    raise SystemExit('This helper provisions only the local development environment.')
directory = Path.home() / '.local/share/hg-studio/dev'
directory.mkdir(parents=True, exist_ok=True, mode=0o700)
target = directory / 'owner.json'
if target.exists():
    if target.stat().st_mode & 0o077:
        raise SystemExit('Owner credential file must have mode 0600.')
    owner = json.loads(target.read_text())
else:
    owner = {'email': 'owner@studio.local', 'password': secrets.token_urlsafe(32)}
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
print('Local owner provisioned. Private credentials are stored in ' + str(target))
