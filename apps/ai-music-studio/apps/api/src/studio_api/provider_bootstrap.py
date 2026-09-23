"""Explicitly import environment provider keys; never replace dashboard credentials."""

import argparse
import os
from uuid import UUID

from sqlalchemy.orm import Session

from studio_api.config import Settings
from studio_api.database import create_database_engine
from studio_api.models import AuthSession, Workspace
from studio_api.provider_routes import CredentialInput, config_row, replace_credential
from studio_api.secret_store import EncryptedFileSecretStore


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace-id", type=UUID, required=True)
    args = parser.parse_args()
    config = Settings()
    try:
        if not config.secret_root or not config.secret_key_file:
            raise ValueError("Secret storage is not configured")
        store = EncryptedFileSecretStore(config.secret_root, config.secret_key_file)
        engine = create_database_engine(config)
        try:
            with Session(engine) as db:
                if db.get(Workspace, args.workspace_id) is None:
                    raise ValueError("Workspace does not exist")
                for provider in ("openai", "openrouter", "anthropic", "elevenlabs"):
                    key = os.environ.get(provider.upper() + "_API_KEY")
                    if not key:
                        continue
                    row = config_row(db, args.workspace_id, provider, lock=True)
                    if row.secret_reference:
                        db.rollback()
                        continue
                    replace_credential(
                        provider,
                        CredentialInput(api_key=key),
                        AuthSession(workspace_id=args.workspace_id),
                        db,
                        store,
                    )
        finally:
            engine.dispose()
    except Exception:
        raise SystemExit("Provider import failed; check configuration and workspace") from None
    print("Provider environment import complete; existing credentials preserved")


if __name__ == "__main__":
    main()
