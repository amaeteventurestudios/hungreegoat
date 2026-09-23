#!/usr/bin/env python3
"""Verify local session/settings recovery after restarting only Studio API and DB."""
import http.cookiejar
import json
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request

root = Path(__file__).resolve().parents[1]
environment = dict(line.split('=', 1) for line in (root / '.env').read_text().splitlines()
                   if line and not line.startswith('#') and '=' in line)
if environment.get('STUDIO_ENV') != 'development':
    raise SystemExit('Recovery check is restricted to local development.')
origin = environment['STUDIO_PUBLIC_URL']
owner = json.loads((Path.home() / '.local/share/hg-studio/dev/owner.json').read_text())
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
csrf = ''


def call(path: str, method: str = 'GET', payload: object = None) -> dict:
    request = urllib.request.Request(origin + '/api/v1' + path, method=method,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={'Origin': origin, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json'})
    with client.open(request, timeout=3) as response:
        return json.load(response) if response.status != 204 else {}


session = call('/auth/login', 'POST', owner)
csrf = session['csrf_token']
original = call('/settings')
try:
    call('/settings', 'PATCH', {'workspace': {'name': 'Recovery verification'}})
    subprocess.run(['bash', str(root / 'scripts/compose.sh'), 'restart', 'studio-postgres', 'studio-api'], check=True)
    for attempt in range(30):
        try:
            assert call('/health/ready')['status'] == 'ok'
            break
        except (urllib.error.URLError, TimeoutError, AssertionError):
            if attempt == 29:
                raise
            time.sleep(1)
    restored_session = call('/auth/session')
    assert restored_session['authenticated']
    assert restored_session['active_workspace_id'] == session['active_workspace_id']
    assert call('/settings')['workspace']['name'] == 'Recovery verification'
    print('PASS: PostgreSQL/API restart preserves the session, workspace and settings.')
finally:
    call('/settings', 'PATCH', original)
    call('/auth/logout', 'POST')
