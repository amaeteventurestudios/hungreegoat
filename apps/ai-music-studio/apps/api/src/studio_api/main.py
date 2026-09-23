import logging
import re
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from uuid import uuid4

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import Engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException
from starlette.formparsers import MultiPartException

from studio_api.arrangement_routes import router as arrangement_router
from studio_api.auth import require_session
from studio_api.auth import router as auth_router
from studio_api.config import Settings
from studio_api.database import create_database_engine
from studio_api.domain_routes import router as domain_router
from studio_api.job_routes import router as job_router
from studio_api.job_routes import service_auth
from studio_api.logging import configure_logging
from studio_api.music_routes import router as music_router
from studio_api.producer_routes import router as producer_router
from studio_api.provider_routes import router as provider_router
from studio_api.settings_routes import router as settings_router
from studio_api.storage import MAX_MULTIPART, UploadTooLarge

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
        application.state.provider_client = httpx.Client(
            timeout=8, follow_redirects=False, trust_env=False
        )
        logger.info("Studio API started")
        try:
            yield
        finally:
            application.state.provider_client.close()
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

    app.include_router(auth_router)
    app.include_router(arrangement_router)
    app.include_router(settings_router)
    app.include_router(provider_router)
    app.include_router(producer_router)
    app.include_router(music_router)
    app.include_router(domain_router)
    app.include_router(job_router)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException) -> JSONResponse:
        if getattr(request.state, "upload_too_large", False):
            return JSONResponse(
                status_code=413,
                content={
                    "error": {
                        "code": "upload_too_large",
                        "message": "Upload exceeds 100 MiB",
                        "details": {},
                    }
                },
            )
        detail = (
            error.detail
            if isinstance(error.detail, dict)
            else {"code": "request_failed", "message": str(error.detail), "details": {}}
        )
        return JSONResponse(status_code=error.status_code, content={"error": detail})

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "Invalid request values",
                    "details": {},
                }
            },
        )

    @app.middleware("http")
    async def request_log(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = str(uuid4())
        request.state.request_id = request_id
        started = time.monotonic()
        try:
            internal = request.url.path.startswith("/api/v1/internal/")
            if internal:
                service_auth(request)
            if (
                not internal
                and request.method not in {"GET", "HEAD", "OPTIONS"}
                and request.headers.get("origin") != config.public_url.rstrip("/")
            ):
                response = JSONResponse(
                    status_code=403,
                    content={
                        "error": {
                            "code": "origin_invalid",
                            "message": "Request origin is not allowed",
                            "details": {},
                        }
                    },
                )
            else:
                upload = request.method == "POST" and re.fullmatch(
                    r"/api/v1/projects/[^/]+/assets/upload", request.url.path
                )
                worker_output = request.method == "PUT" and re.fullmatch(
                    r"/api/v1/internal/jobs/[^/]+/attempts/[1-9][0-9]*/outputs/[1-4]",
                    request.url.path,
                )
                if upload or worker_output:
                    if upload:
                        with Session(request.app.state.engine) as auth_db:
                            require_session(request, auth_db)
                    original_receive = request._receive
                    received = 0

                    async def bounded_receive():
                        nonlocal received
                        message = await original_receive()
                        if message["type"] == "http.request":
                            received += len(message.get("body", b""))
                            if received > MAX_MULTIPART:
                                request.state.upload_too_large = True
                                raise MultiPartException("Upload exceeds size limit")
                        return message

                    request._receive = bounded_receive
                    response = await call_next(request)
                else:
                    too_large = False
                    if request.method not in {"GET", "HEAD", "OPTIONS"}:
                        chunks = []
                        length = 0
                        async for chunk in request.stream():
                            length += len(chunk)
                            if length > 1024 * 1024:
                                too_large = True
                                break
                            chunks.append(chunk)
                        if not too_large:
                            request._body = b"".join(chunks)
                    if too_large:
                        response = JSONResponse(
                            status_code=413,
                            content={
                                "error": {
                                    "code": "request_too_large",
                                    "message": "Request exceeds size limit",
                                    "details": {},
                                }
                            },
                        )
                    else:
                        response = await call_next(request)
        except HTTPException as error:
            response = await http_error(request, error)
        except UploadTooLarge:
            response = JSONResponse(
                status_code=413,
                content={
                    "error": {
                        "code": "upload_too_large",
                        "message": "Upload exceeds 100 MiB",
                        "details": {},
                    }
                },
            )
        except Exception as error:
            logger.error(
                "Request failed",
                extra={"request_id": request_id, "error_type": type(error).__name__},
            )
            response = JSONResponse(
                status_code=500,
                content={
                    "error": {
                        "code": "internal_error",
                        "message": "Internal server error",
                        "details": {"request_id": request_id},
                    }
                },
            )
        response.headers["X-Request-ID"] = request_id
        if request.url.path.startswith(("/api/v1/auth", "/api/v1/settings", "/api/v1/internal")):
            response.headers["Cache-Control"] = "no-store"
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
