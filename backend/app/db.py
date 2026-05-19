from collections.abc import Iterator

from sqlalchemy import URL, create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from supabase import Client, create_client

from backend.app.config import get_settings


settings = get_settings()


def build_database_url() -> URL | str:
    raw_url = settings.database_url.strip()

    # In production, prefer an explicit DATABASE_URL first so Railway can supply
    # a reachable Postgres connection string. The Supabase host fields are kept
    # as a local-development convenience and fallback.
    if raw_url and raw_url != "postgresql+psycopg://postgres:postgres@localhost:5432/postgres":
        if raw_url.startswith("postgresql://"):
            raw_url = raw_url.replace("postgresql://", "postgresql+psycopg://", 1)

        parsed_url = make_url(raw_url)
        if parsed_url.host is None or parsed_url.host.startswith("@"):
            raise ValueError(
                "DATABASE_URL is not valid for a TCP Postgres connection. "
                "For Supabase, prefer setting SUPABASE_DB_HOST and SUPABASE_DB_PASSWORD in .env, "
                "or URL-encode special characters in the password if you use DATABASE_URL."
            )

        return raw_url

    if settings.supabase_db_host and settings.supabase_db_password:
        return URL.create(
            "postgresql+psycopg",
            username=settings.supabase_db_user,
            password=settings.supabase_db_password,
            host=settings.supabase_db_host,
            port=settings.supabase_db_port,
            database=settings.supabase_db_name,
        )

    if raw_url.startswith("postgresql://"):
        raw_url = raw_url.replace("postgresql://", "postgresql+psycopg://", 1)

    parsed_url = make_url(raw_url)
    if parsed_url.host is None or parsed_url.host.startswith("@"):
        raise ValueError(
            "DATABASE_URL is not valid for a TCP Postgres connection. "
            "For Supabase, prefer setting SUPABASE_DB_HOST and SUPABASE_DB_PASSWORD in .env, "
            "or URL-encode special characters in the password if you use DATABASE_URL."
        )

    return raw_url


def create_app_engine():
    try:
        return create_engine(build_database_url(), pool_pre_ping=True)
    except (ValueError, SQLAlchemyError):
        if settings.environment == "production":
            raise
        return create_engine("sqlite+pysqlite:///:memory:")


engine = create_app_engine()
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_supabase() -> Client:
    return create_client(str(settings.supabase_url), settings.supabase_service_role_key)
