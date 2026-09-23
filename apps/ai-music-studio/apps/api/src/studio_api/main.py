import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import Engine, text
from sqlalchemy.exc import SQLAlchemyError

from studio_api.config import Settings
from studio_api.database import create_database_engine
from studio_api.logging import configure_logging

logger = logging.getLogger("studio.api")


class HealthResponse(BaseModel):
    status: str
    service: str = "studio-api"
    database: str | None = None


def create_app(settings: Settings | None = None, engine: Engine | None = None) -> FastAPI:
    config = settings or Settings()
    configure_logging(config.log_level)

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        application.state.engine = engine or create_database_engine(config)
        application.state.settings = config
        logger.info("Studio API started")
        try:
            yield
        finally:
            if engine is None:
                application.state.engine.dispose()
            logger.info("Studio API stopped")

    app = FastAPI(
        title="Hungree Goat Studio API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs" if config.env != "production" else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if config.env != "production" else None,
    )

    @app.middleware("http")
    async def request_log(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = str(uuid4())
        request.state.request_id = request_id
        started = time.monotonic()
        try:
            response = await call_next(request)
        except Exception as error:
            logger.error(
                "Request failed",
                extra={"request_id": request_id, "error_type": type(error).__name__},
            )
            response = JSONResponse(
                status_code=500,
                content={"detail": "Internal server error", "request_id": request_id},
            )
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "Request completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": round((time.monotonic() - started) * 1000, 2),
            },
        )
        return response

    @app.get("/api/v1/health/live", response_model=HealthResponse)
    def live() -> HealthResponse:
        return HealthResponse(status="ok")

    @app.get(
        "/api/v1/health/ready",
        response_model=HealthResponse,
        responses={503: {"model": HealthResponse}},
    )
    def ready(request: Request, response: Response) -> HealthResponse:
        try:
            with request.app.state.engine.connect() as connection:
                connection.execute(text("SELECT 1"))
                revision = connection.execute(
                    text("SELECT version_num FROM alembic_version")
                ).scalar()
                if not revision:
                    raise SQLAlchemyError("Database has no applied migration")
        except SQLAlchemyError as error:
            logger.warning("Database readiness failed", extra={"error_type": type(error).__name__})
            response.status_code = 503
            return HealthResponse(status="unavailable", database="unavailable")
        return HealthResponse(status="ok", database="ok")

    return app
