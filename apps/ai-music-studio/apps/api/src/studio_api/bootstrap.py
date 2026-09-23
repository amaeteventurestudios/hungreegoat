"""Create the initial owner from stdin or a protected password file."""

import argparse
import os
import stat
import sys

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from studio_api.auth import password_hasher
from studio_api.config import Settings
from studio_api.database import create_database_engine
from studio_api.models import Membership, User, Workspace, WorkspaceSettings
from studio_api.schemas import SettingsDocument, WorkspacePreferences


def bootstrap_owner(
    db: Session, email: str, password: str, display_name: str, workspace_name: str
) -> None:
    email = email.strip().lower()
    if not (3 <= len(email) <= 254 and "@" in email):
        raise ValueError("A valid owner email is required")
    if not 12 <= len(password) <= 128:
        raise ValueError("Password must contain 12–128 characters")
    if not 1 <= len(display_name.strip()) <= 120:
        raise ValueError("Display name must contain 1–120 characters")
    document = SettingsDocument(workspace=WorkspacePreferences(name=workspace_name))
    db.execute(text("SELECT pg_advisory_xact_lock(78165001)"))
    if db.scalar(select(User.id).limit(1)):
        raise ValueError("Owner already exists; bootstrap refused")
    user = User(
        email=email, display_name=display_name.strip(), password_hash=password_hasher.hash(password)
    )
    workspace = Workspace(name=document.workspace.name)
    db.add_all([user, workspace])
    db.flush()
    db.add_all(
        [
            Membership(user_id=user.id, workspace_id=workspace.id, role="owner"),
            WorkspaceSettings(workspace_id=workspace.id, document=document.model_dump()),
        ]
    )
    db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--display-name", default="Owner")
    parser.add_argument("--workspace-name", default="My studio")
    parser.add_argument("--password-file")
    args = parser.parse_args()
    try:
        if args.password_file:
            fd = os.open(args.password_file, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(fd) as handle:
                info = os.fstat(handle.fileno())
                if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
                    raise ValueError("Password file must be a regular file with mode 0600")
                password = handle.read(1024).rstrip("\r\n")
        else:
            password = sys.stdin.read(1024).rstrip("\r\n")
        engine = create_database_engine(Settings())
        try:
            with Session(engine) as db:
                bootstrap_owner(db, args.email, password, args.display_name, args.workspace_name)
        finally:
            engine.dispose()
    except ValueError as error:
        raise SystemExit(str(error)) from None
    except Exception:
        raise SystemExit(
            "Bootstrap failed; check configuration and database availability"
        ) from None
    print("Owner and workspace created")


if __name__ == "__main__":
    main()
