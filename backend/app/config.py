from functools import lru_cache

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    app_name: str = "MediCORE"
    api_base_url: str = "http://localhost:8000"
    frontend_origin: str = "http://localhost:3000"
    mock_data_enabled: bool = False

    supabase_url: AnyHttpUrl = "https://example.supabase.co"
    supabase_service_role_key: str = Field(default="replace-me", repr=False)
    supabase_storage_bucket: str = "catalog-pdfs"
    database_url: str = Field(default="postgresql+psycopg://postgres:postgres@localhost:5432/postgres", repr=False)
    supabase_db_host: str = ""
    supabase_db_port: int = 5432
    supabase_db_name: str = "postgres"
    supabase_db_user: str = "postgres"
    supabase_db_password: str = Field(default="", repr=False)
    supabase_pooler_host: str = ""
    supabase_pooler_port: int = 6543
    supabase_pooler_user: str = ""

    redis_url: str = "redis://localhost:6379/0"

    groq_api_key: str = Field(default="replace-me", repr=False)
    groq_model: str = "llama-3.1-8b-instant"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    email_mode: str = "imap"
    imap_host: str = "imap.gmail.com"
    imap_port: int = 993
    imap_username: str = ""
    imap_password: str = Field(default="", repr=False)
    imap_mailbox: str = "INBOX"

    gmail_webhook_token: str = Field(default="", repr=False)
    gmail_oauth_token: str = Field(default="", repr=False)
    gmail_user_id: str = "me"
    google_project_id: str = ""
    google_pubsub_topic: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()

