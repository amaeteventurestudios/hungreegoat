#!/usr/bin/env python3
"""Read-only regression smoke checks for the existing public Hungree Goat surfaces."""
import json
import urllib.request

urls = [
    'https://hungreegoat.com',
    'https://player.hungreegoat.com',
    'https://control.hungreegoat.com',
    'https://control.hungreegoat.com/dj/index.html',
    'https://api.hungreegoat.com/v1/health/broadcast?station=lofi',
]
for url in urls:
    with urllib.request.urlopen(url, timeout=30) as response:
        if response.status != 200:
            raise SystemExit(f'Unexpected status {response.status}: {url}')
        print(json.dumps({'url': url, 'status': response.status}))
