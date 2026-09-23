#!/usr/bin/env python3
"""Create a bounded diagnostic in the local development Studio, returning IDs only."""
import argparse
import json
from pathlib import Path
import subprocess
from uuid import UUID

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--project-id', required=True, type=UUID)
parser.add_argument('--idempotency-key', required=True, type=UUID)
parser.add_argument('--duration-seconds', type=int, default=1, choices=range(1, 121), metavar='1..120')
parser.add_argument('--payload', default='Studio diagnostic fixture')
parser.add_argument('--fail-first-attempt', action='store_true')
args = parser.parse_args()
if len(args.payload) > 1000:
    parser.error('Diagnostic payload exceeds limit')
root = Path(__file__).resolve().parents[1]
config = dict(line.split('=', 1) for line in (root / '.env').read_text().splitlines()
              if line and not line.startswith('#') and '=' in line)
if config.get('STUDIO_ENV') != 'development':
    raise SystemExit('Diagnostic creation is restricted to development.')
command = ['bash', str(root / 'scripts/compose.sh'), 'exec', '-T', 'studio-api',
           'python', '-m', 'studio_api.diagnostic', '--project-id', str(args.project_id),
           '--idempotency-key', str(args.idempotency_key), '--duration-seconds',
           str(args.duration_seconds), '--payload', args.payload]
if args.fail_first_attempt:
    command.append('--fail-first-attempt')
result = subprocess.run(command, capture_output=True, text=True)
if result.returncode:
    raise SystemExit('Diagnostic creation failed; inspect sanitized Studio service logs.')
try:
    response = json.loads(result.stdout)
    public = {name: str(UUID(response[name])) for name in ('job_id', 'project_id')}
except (ValueError, KeyError, TypeError):
    raise SystemExit('Diagnostic returned an invalid response.') from None
print(json.dumps(public))
