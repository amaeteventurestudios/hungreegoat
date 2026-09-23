from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session

from studio_api.config import Settings


class Base(DeclarativeBase):
    pass


def create_database_engine(settings: Settings) -> Engine:
    url = make_url(settings.database_url.get_secret_value()).set(drivername="postgresql+psycopg")
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        connect_args={"connect_timeout": settings.database_connect_timeout},
    )


def get_session(request: Request) -> Iterator[Session]:
    with Session(request.app.state.engine) as session:
        yield session
