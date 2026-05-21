from collections.abc import Iterator

from sqlalchemy import URL, create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from supabase import Client, create_client

from backend.app.config import get_settings


settings = get_settings()


import urllib.parse

def repair_database_url(url: str) -> str:
    url = url.strip()
    if not url:
        return url
        
    scheme = "postgresql+psycopg"
    if url.startswith("postgresql+psycopg://"):
        url_payload = url[len("postgresql+psycopg://"):]
    elif url.startswith("postgresql://"):
        url_payload = url[len("postgresql://"):]
    elif url.startswith("postgres://"):
        url_payload = url[len("postgres://"):]
    else:
        return url
        
    if "@" not in url_payload:
        return f"{scheme}://{url_payload}"
        
    creds, conn = url_payload.rsplit("@", 1)
    
    if ":" in creds:
        user, password = creds.split(":", 1)
        try:
            # Decode first to prevent double-encoding
            decoded = urllib.parse.unquote(password)
            password = urllib.parse.quote_plus(decoded)
        except Exception:
            if "%" not in password:
                password = urllib.parse.quote_plus(password)
        creds = f"{user}:{password}"
        
    return f"{scheme}://{creds}@{conn}"


def build_database_url() -> URL | str:
    raw_url = settings.database_url.strip()

    # In production, prefer an explicit DATABASE_URL first so Railway can supply
    # a reachable Postgres connection string. The Supabase host fields are kept
    # as a local-development convenience and fallback.
    if not raw_url or raw_url == "postgresql+psycopg://postgres:postgres@localhost:5432/postgres":
        if settings.supabase_db_host and settings.supabase_db_password:
            return URL.create(
                "postgresql+psycopg",
                username=settings.supabase_db_user,
                password=settings.supabase_db_password,
                host=settings.supabase_db_host,
                port=settings.supabase_db_port,
                database=settings.supabase_db_name,
            )

    return repair_database_url(raw_url)


def create_app_engine():
    try:
        return create_engine(build_database_url(), pool_pre_ping=True)
    except Exception:
        if settings.environment == "production":
            raise
        return create_engine("sqlite+pysqlite:///:memory:")


# Create engine and SessionLocal gracefully to prevent container startup crashes
_engine = None
_SessionLocal = None
startup_error = None

try:
    _engine = create_app_engine()
    _SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False)
except Exception as e:
    startup_error = e

# Export engine for backward compatibility
engine = _engine


def SessionLocal(*args, **kwargs):
    if startup_error:
        raise RuntimeError(
            f"Database initialization failed at startup. Error: {startup_error}"
        ) from startup_error
    return _SessionLocal(*args, **kwargs)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    if startup_error:
        raise RuntimeError(
            f"Database connection failed due to startup error. Please check your environment variables (like DATABASE_URL). Details: {startup_error}"
        ) from startup_error
        
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_supabase() -> Client:
    return create_client(str(settings.supabase_url), settings.supabase_service_role_key)
