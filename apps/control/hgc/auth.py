"""Operator authentication: single operator account, salted PBKDF2 hash on disk,
signed session cookie. Secrets live in ~/hungree-goat/secrets (0700/0600) and are
never returned by the API."""
from __future__ import annotations
import hashlib
import hmac
import json
import os
import secrets
import time

from itsdangerous import BadSignature, URLSafeTimedSerializer

from . import config, db

OPERATOR_FILE = config.SECRETS_DIR / "operator.json"
PASSWORD_FILE = config.SECRETS_DIR / "operator-password.txt"
SESSION_KEY_FILE = config.SECRETS_DIR / "session.key"
INTERNAL_TOKEN_FILE = config.SECRETS_DIR / "internal.token"
COOKIE = "hgc_session"
SESSION_TTL = 60 * 60 * 24 * 14


def _write_secret(path, text: str) -> None:
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(text)


def _hash(pw: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 200_000).hex()


def bootstrap() -> None:
    config.ensure_dirs()
    if not SESSION_KEY_FILE.exists():
        _write_secret(SESSION_KEY_FILE, secrets.token_hex(32))
    if not INTERNAL_TOKEN_FILE.exists():
        _write_secret(INTERNAL_TOKEN_FILE, secrets.token_hex(24))
    if not OPERATOR_FILE.exists():
        pw = secrets.token_urlsafe(12)
        set_password("operator", pw)
        _write_secret(PASSWORD_FILE, pw + "\n")
        db.log_event("info", "auth", "Operator account created; initial password written to secrets/operator-password.txt")


def set_password(username: str, pw: str) -> None:
    salt = secrets.token_bytes(16)
    _write_secret(OPERATOR_FILE, json.dumps({"username": username, "salt": salt.hex(), "hash": _hash(pw, salt),
                                             "updated_at": time.time()}))


def verify(username: str, pw: str) -> bool:
    try:
        rec = json.loads(OPERATOR_FILE.read_text())
    except Exception:
        return False
    if not hmac.compare_digest(rec.get("username", ""), username):
        return False
    return hmac.compare_digest(rec["hash"], _hash(pw, bytes.fromhex(rec["salt"])))


def serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(SESSION_KEY_FILE.read_text().strip(), salt="hgc-session")


def issue(username: str) -> str:
    return serializer().dumps({"u": username, "t": time.time()})


def check(token: str | None) -> str | None:
    if not token:
        return None
    try:
        data = serializer().loads(token, max_age=SESSION_TTL)
        return data.get("u")
    except BadSignature:
        return None


def internal_token() -> str:
    return INTERNAL_TOKEN_FILE.read_text().strip()
