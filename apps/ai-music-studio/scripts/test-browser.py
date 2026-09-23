#!/usr/bin/env python3
"""Inject protected local test credentials into the browser runner environment."""
import json
import os
from pathlib import Path
import subprocess
import sys

os.umask(0o077)
root = Path(__file__).resolve().parents[1]
credentials = Path.home() / '.local/share/hg-studio/dev/owner.json'
if credentials.stat().st_mode & 0o077:
    raise SystemExit('Owner credential file must have mode 0600.')
owner = json.loads(credentials.read_text())
environment = dict(os.environ)
environment.update({
    'STUDIO_TEST_EMAIL': owner['email'],
    'STUDIO_TEST_PASSWORD': owner['password'],
    'STUDIO_TEST_BASE_URL': 'http://localhost:3210',
    'PLAYWRIGHT_HOST_PLATFORM_OVERRIDE': 'ubuntu24.04-x64',
})
command = ['npx', 'playwright', 'test', '--config', 'tests/browser/playwright.config.ts', *sys.argv[1:]]
raise SystemExit(subprocess.run(command, cwd=root, env=environment).returncode)
