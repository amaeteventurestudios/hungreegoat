import argparse
import json
from uuid import UUID

from sqlalchemy.orm import Session

from studio_api.config import Settings
from studio_api.database import create_database_engine
from studio_api.domain_models import Project
from studio_api.job_service import DiagnosticInput, create_diagnostic


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a private development worker diagnostic")
    parser.add_argument("--project-id", required=True, type=UUID)
    parser.add_argument("--idempotency-key", required=True, type=UUID)
    parser.add_argument("--duration-seconds", type=int, default=1)
    parser.add_argument("--payload", default="Studio worker diagnostic")
    parser.add_argument("--fail-first-attempt", action="store_true")
    args = parser.parse_args()
    config = Settings()
    if config.env == "production":
        raise SystemExit("Diagnostics are disabled in production")
    engine = create_database_engine(config)
    try:
        with Session(engine) as db:
            project = db.get(Project, args.project_id)
            if project is None:
                raise ValueError
            job = create_diagnostic(
                db,
                project.workspace_id,
                project.id,
                args.idempotency_key,
                DiagnosticInput(
                    duration_seconds=args.duration_seconds,
                    payload=args.payload,
                    fail_first_attempt=args.fail_first_attempt,
                ),
            )
            print(json.dumps({"job_id": str(job.id), "project_id": str(project.id)}))
    except Exception:
        raise SystemExit("Diagnostic creation failed; check project and input settings") from None
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
