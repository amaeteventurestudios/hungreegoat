import hashlib
import secrets
from datetime import timedelta
from threading import BoundedSemaphore

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from studio_api.database import get_session
from studio_api.models import AuthSession, LoginThrottle, Membership, User, Workspace, utcnow
from studio_api.schemas import LoginInput, PasswordInput

router = APIRouter(prefix="/api/v1/auth")


class BoundedPasswordHasher:
    def __init__(self) -> None:
        self._hasher = PasswordHasher()
        self._slots = BoundedSemaphore(2)

    def hash(self, password: str) -> str:
        with self._slots:
            return self._hasher.hash(password)

    def verify(self, encoded: str, password: str) -> bool:
        with self._slots:
            return self._hasher.verify(encoded, password)

    def check_needs_rehash(self, encoded: str) -> bool:
        return self._hasher.check_needs_rehash(encoded)


password_hasher = BoundedPasswordHasher()
_dummy_hash = password_hasher.hash(secrets.token_urlsafe(32))


def cookie_name(request: Request) -> str:
    return (
        "__Host-studio_session"
        if request.app.state.settings.env == "production"
        else "studio_session"
    )


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def fail(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status, {"code": code, "message": message, "details": {}})


def session_or_none(request: Request, db: Session) -> AuthSession | None:
    token = request.cookies.get(cookie_name(request))
    if not token:
        return None
    session = db.get(AuthSession, token_hash(token))
    if not session or session.expires_at <= utcnow():
        return None
    if not db.get(Membership, (session.user_id, session.workspace_id)):
        return None
    return session


def require_session(request: Request, db: Session = Depends(get_session)) -> AuthSession:
    session = session_or_none(request, db)
    if session is None:
        raise fail(401, "authentication_required", "Sign in to continue")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        token = request.headers.get("x-csrf-token", "")
        if not secrets.compare_digest(token, session.csrf_token):
            raise fail(403, "csrf_invalid", "Refresh the page and try again")
    return session


def session_document(session: AuthSession | None, db: Session) -> dict:
    if session is None:
        return {
            "authenticated": False,
            "user": None,
            "workspaces": [],
            "active_workspace_id": None,
            "csrf_token": None,
        }
    user = db.get(User, session.user_id)
    rows = db.execute(
        select(Workspace, Membership.role)
        .join(Membership, Membership.workspace_id == Workspace.id)
        .where(Membership.user_id == session.user_id)
    ).all()
    return {
        "authenticated": True,
        "user": {"id": str(user.id), "email": user.email, "display_name": user.display_name},
        "workspaces": [{"id": str(w.id), "name": w.name, "role": role} for w, role in rows],
        "active_workspace_id": str(session.workspace_id),
        "csrf_token": session.csrf_token,
    }


@router.get("/session")
def current_session(request: Request, db: Session = Depends(get_session)) -> dict:
    return session_document(session_or_none(request, db), db)


@router.post("/login")
def login(
    data: LoginInput, request: Request, response: Response, db: Session = Depends(get_session)
) -> dict:
    email = data.email.strip().lower()
    # Use the actual peer, never caller-supplied forwarded headers. Behind the
    # private proxy this intentionally provides an instance-wide safety bound.
    source_key = token_hash("source:" + (request.client.host if request.client else "unknown"))
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": source_key})
    source = db.get(LoginThrottle, source_key)
    now = utcnow()
    if source is None:
        source = LoginThrottle(key=source_key, attempts=0, window_start=now)
        db.add(source)
    if source.window_start + timedelta(minutes=15) <= now:
        source.attempts = 0
        source.window_start = now
    if source.attempts >= 20:
        raise fail(429, "login_rate_limited", "Too many attempts. Try again later")
    # Account-scoped throttling works behind the fixed web proxy without trusting X-Forwarded-For.
    key = token_hash("account:" + email)
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": key})
    throttle = db.get(LoginThrottle, key)
    now = utcnow()
    if not throttle:
        throttle = LoginThrottle(key=key, attempts=0, window_start=now)
        db.add(throttle)
    if throttle.window_start + timedelta(minutes=15) <= now:
        throttle.attempts = 0
        throttle.window_start = now
    if throttle.attempts >= 5:
        raise fail(429, "login_rate_limited", "Too many attempts. Try again later")
    user = db.scalar(select(User).where(User.email == email))
    try:
        password_hasher.verify(
            user.password_hash if user else _dummy_hash, data.password.get_secret_value()
        )
        valid = user is not None
    except VerificationError:
        valid = False
    if not valid:
        throttle.attempts += 1
        source.attempts += 1
        db.commit()
        raise fail(401, "invalid_credentials", "Email or password is incorrect")
    workspace_id = db.scalar(
        select(Membership.workspace_id)
        .where(Membership.user_id == user.id)
        .order_by(Membership.workspace_id)
    )
    if workspace_id is None:
        raise fail(401, "invalid_credentials", "Email or password is incorrect")
    if password_hasher.check_needs_rehash(user.password_hash):
        user.password_hash = password_hasher.hash(data.password.get_secret_value())
    throttle.attempts = 0
    old_token = request.cookies.get(cookie_name(request))
    if old_token:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == token_hash(old_token)))
    token = secrets.token_urlsafe(32)
    lifetime = request.app.state.settings.session_lifetime_seconds
    session = AuthSession(
        token_hash=token_hash(token),
        user_id=user.id,
        workspace_id=workspace_id,
        csrf_token=secrets.token_urlsafe(32),
        expires_at=now + timedelta(seconds=lifetime),
    )
    db.add(session)
    db.commit()
    response.set_cookie(
        cookie_name(request),
        token,
        max_age=lifetime,
        httponly=True,
        secure=request.app.state.settings.public_url.startswith("https://"),
        samesite="lax",
        path="/",
    )
    return session_document(session, db)


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    session: AuthSession = Depends(require_session),
    db: Session = Depends(get_session),
) -> None:
    db.delete(session)
    db.commit()
    response.delete_cookie(
        cookie_name(request),
        path="/",
        httponly=True,
        secure=request.app.state.settings.public_url.startswith("https://"),
        samesite="lax",
    )


@router.post("/password", status_code=204)
def change_password(
    data: PasswordInput,
    request: Request,
    response: Response,
    session: AuthSession = Depends(require_session),
    db: Session = Depends(get_session),
) -> None:
    user = db.get(User, session.user_id)
    # Serialize changes to ensure the current password cannot be reused concurrently.
    db.refresh(user, with_for_update=True)
    try:
        password_hasher.verify(user.password_hash, data.current_password.get_secret_value())
    except VerificationError:
        raise fail(401, "invalid_credentials", "Current password is incorrect") from None
    user.password_hash = password_hasher.hash(data.new_password.get_secret_value())
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    db.commit()
    response.delete_cookie(
        cookie_name(request),
        path="/",
        httponly=True,
        secure=request.app.state.settings.public_url.startswith("https://"),
        samesite="lax",
    )
