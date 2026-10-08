import os
from dataclasses import dataclass


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "sqlite:///./dev.db")
    # Supabase entrega "postgresql://..." ou "postgres://..."; o SQLAlchemy precisa do driver psycopg 3.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


@dataclass(frozen=True)
class Settings:
    database_url: str = _database_url()
    vapid_public_key: str = os.getenv("VAPID_PUBLIC_KEY", "")
    vapid_private_key: str = os.getenv("VAPID_PRIVATE_KEY", "")
    vapid_subject: str = os.getenv("VAPID_SUBJECT", "mailto:voce@example.com")
    # Em desenvolvimento local (http) o cookie não pode ser Secure.
    cookie_secure: bool = os.getenv("COOKIE_SECURE", "true").lower() == "true"
    session_days: int = 90
    app_name: str = "Casal de Periquito"
    timezone: str = "America/Sao_Paulo"


settings = Settings()
