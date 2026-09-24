#!/usr/bin/env python3
"""Syntax-check both Studio-only gateway vhosts without touching the shared gateway."""

from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
GATEWAY = ROOT / "infra/gateway"

with tempfile.TemporaryDirectory(prefix="studio-nginx-test-") as temporary:
    root = Path(temporary)
    certificate = root / "live/studio.hungreegoat.com"
    certificate.mkdir(parents=True)
    subprocess.run([
        "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
        "-subj", "/CN=studio.hungreegoat.com", "-keyout", str(certificate / "privkey.pem"),
        "-out", str(certificate / "fullchain.pem"),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(["openssl", "dhparam", "-dsaparam", "-out", str(root / "ssl-dhparams.pem"), "2048"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    (root / "options-ssl-nginx.conf").write_text("ssl_protocols TLSv1.2 TLSv1.3;\n")
    for name in ("studio-http.nginx", "studio-https.nginx"):
        subprocess.run([
            "docker", "run", "--rm", "--network", "none",
            "-v", f"{root}:/etc/letsencrypt:ro",
            "-v", f"{GATEWAY / name}:/etc/nginx/conf.d/studio.conf:ro",
            "nginx:1.24-alpine", "nginx", "-t",
        ], check=True, stdout=subprocess.DEVNULL)
        print(f"Gateway syntax passed: {name}")
