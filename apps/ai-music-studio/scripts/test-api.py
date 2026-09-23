#!/usr/bin/env python3
"""Run API checks against a disposable database in the local Studio cluster."""
import json
import os
from pathlib import Path
import subprocess
import uuid

root = Path(__file__).resolve().parents[1]
compose = ['bash', str(root / 'scripts/compose.sh')]
environment = {}
for line in (root / '.env').read_text().splitlines():
    if line.strip() and not line.startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        environment[key] = value
if environment.get('STUDIO_ENV') != 'development':
    raise SystemExit('This harness only operates on the local development environment.')
container = subprocess.check_output(compose + ['ps', '-q', 'studio-postgres'], text=True).strip()
network_data = json.loads(subprocess.check_output(
    ['docker', 'inspect', '--format', '{{json .NetworkSettings.Networks}}', container], text=True))
host = next(iter(network_data.values()))['IPAddress']
database = 'studio_test_' + uuid.uuid4().hex
psql = compose + ['exec', '-T', 'studio-postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'studio', '-d', 'postgres', '-c']
subprocess.run(psql + [f'CREATE DATABASE {database}'], check=True, stdout=subprocess.DEVNULL)
try:
    env = dict(os.environ)
    env['STUDIO_TEST_DATABASE_URL'] = f"postgresql+psycopg://studio:{environment['STUDIO_DB_PASSWORD']}@{host}:5432/{database}"
    result = subprocess.run([str(root / 'apps/api/.venv/bin/pytest'), '-q'], cwd=root / 'apps/api', env=env)
    raise SystemExit(result.returncode)
finally:
    subprocess.run(psql + [f'DROP DATABASE {database} WITH (FORCE)'], check=True, stdout=subprocess.DEVNULL)
