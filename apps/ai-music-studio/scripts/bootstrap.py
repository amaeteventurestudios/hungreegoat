#!/usr/bin/env python3
"""Create a private local development environment without overwriting configuration."""
import os
from pathlib import Path
import secrets

root = Path(__file__).resolve().parents[1]
target = root / '.env'
if target.exists():
    print('Existing .env preserved.')
else:
    data = Path.home() / '.local/share/hg-studio/dev'
    assets = data / 'assets'
    assets.mkdir(parents=True, exist_ok=True, mode=0o700)
    password = secrets.token_hex(32)
    settings = {
        'STUDIO_ENV': 'development',
        'COMPOSE_PROJECT_NAME': 'hg-studio-dev',
        'STUDIO_LOG_LEVEL': 'INFO',
        'STUDIO_UID': str(os.getuid()),
        'STUDIO_GID': str(os.getgid()),
        'STUDIO_BIND_HOST': '127.0.0.1',
        'STUDIO_WEB_PORT': '3210',
        'STUDIO_API_PORT': '8310',
        'STUDIO_PUBLIC_URL': 'http://localhost:3210',
        'STUDIO_DB_PASSWORD': password,
        'STUDIO_ASSET_ROOT': str(assets),
    }
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as handle:
        handle.write(''.join(f'{key}={value}\n' for key, value in settings.items()))
    print('Created private .env and external development asset directory.')
